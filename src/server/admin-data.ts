import "server-only";
import { recentMisses, weekDates } from "@/lib/habits";

import {
  calculateParticipantStatuses,
  calculatePenalty,
  calculateStreak,
  evaluateDailyStatus,
  paymentStatusFor,
  summarizeStatuses,
} from "@/lib/business";
import { dateKeysInMonth, kstDateKey } from "@/lib/time";
import type { AdminData, AdminSessionView, DailyStatus, PushDeliveryStatus, Submission } from "@/lib/types";
import { getAdminSession } from "@/server/admin-session";
import { getAppData } from "@/server/app-data";
import { getSupabaseAdmin, isDemoMode } from "@/server/supabase";

type ReminderAdminRow = {
  participant_id: number;
  reminder_time: string;
  last_attempt_at: string | null;
  last_delivery_status: PushDeliveryStatus | null;
  last_response_status: number | null;
  last_error: string | null;
  last_sent_date: string | null;
  created_at: string;
};

export async function getOperatorChoices() {
  if (isDemoMode()) {
    return [
      { id: "1", name: "이나윤", isActive: true },
      { id: "2", name: "운영자", isActive: true },
    ];
  }
  const { data, error } = await getSupabaseAdmin()
    .from("operators")
    .select("id,name,is_active")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((operator) => ({
    id: String(operator.id),
    name: operator.name,
    isActive: operator.is_active,
  }));
}

export async function getAdminData(
  month?: string,
  challengeId?: string,
  providedSession?: AdminSessionView,
): Promise<AdminData> {
  const session = providedSession ?? (await getAdminSession());
  if (!session.authenticated || !session.operatorId) throw new Error("UNAUTHORIZED");
  const now = new Date();
  const today = kstDateKey(now);
  const selectedMonth = month ?? today.slice(0, 7);

  if (isDemoMode()) {
    const base = await getAppData({ month: selectedMonth, date: "all" });
    const participantApps = await Promise.all(
      base.participants.map((participant) =>
        getAppData({ participantId: participant.id, month: selectedMonth, date: "all" }),
      ),
    );
    const participants = participantApps.map((app, index) => {
      const participant = base.participants[index];
      const penaltyAmount = app.summary.missedDays * 2000;
      const paidAt = base.challenge?.startDate ?? null;
      return {
        ...participant,
        paidAmount: 80000,
        paidAt,
        paymentStatus: paymentStatusFor({ paidAmount: 80000, paidAt, fee: 80000 }),
        refundedAmount: null,
        isActive: true,
        ...app.summary,
        penaltyAmount,
        expectedRefund: 80000 - penaltyAmount,
      };
    });
    const todayRows = participantApps.map((app, index) => ({
      participantId: base.participants[index].id,
      name: base.participants[index].name,
      status: app.todayStatus,
      linkCount: app.feed.filter(
        (submission) =>
          submission.participantId === base.participants[index].id &&
          kstDateKey(submission.submittedAt) === today,
      ).length,
      reminder: null,
    }));
    const allLinks = base.feed.filter((submission) =>
      kstDateKey(submission.submittedAt).startsWith(selectedMonth),
    );
    return {
      demo: true,
      habit: participantApps.map((app, index) => ({ ...app.habit, participantId: base.participants[index].id, name: base.participants[index].name, active: app.todayStatus !== "not_enrolled" })),
      weeklyPenalty: { missedCount: 0, amount: 0, participantCount: 0 },
      session,
      challenge: base.challenge
        ? { ...base.challenge, defaultFee: 80000, defaultPenalty: 2000, isActive: true }
        : null,
      challenges: base.challenge
        ? [{ ...base.challenge, defaultFee: 80000, defaultPenalty: 2000, isActive: true }]
        : [],
      operators: await getOperatorChoices(),
      participants,
      today: todayRows,
      metrics: {
        totalParticipants: participants.length,
        paidCount: participants.filter((participant) => participant.paymentStatus === "paid").length,
        unpaidCount: participants.filter((participant) => participant.paymentStatus === "unpaid").length,
        todayCompleted: todayRows.filter((row) => row.status === "completed").length,
        todayPending: todayRows.filter((row) => row.status === "pending").length,
        todayMissed: todayRows.filter((row) => row.status === "missed").length,
        monthMissed: participants.reduce((sum, participant) => sum + participant.missedDays, 0),
        monthPenalty: participants.reduce((sum, participant) => sum + participant.penaltyAmount, 0),
        monthLinks: allLinks.length,
      },
      matrix: participantApps.map((app, index) => ({
        participantId: base.participants[index].id,
        name: base.participants[index].name,
        days: Object.fromEntries(app.calendar.map((day) => [day.date, day.status])),
      })),
      submissions: base.feed,
      exemptions: [],
      excludedDates: [],
      penaltyRates: [{ id: "1", amount: 2000, effectiveFrom: base.challenge?.startDate ?? `${selectedMonth}-01` }],
      notices: base.notices,
      auditLogs: [],
      month: selectedMonth,
    };
  }

  const db = getSupabaseAdmin();
  const { data: challengeRows, error: challengeListError } = await db
    .from("challenges")
    .select("id,name,start_date,end_date,penalty_start_date,default_fee,default_penalty,is_active")
    .order("start_date", { ascending: false });
  if (challengeListError) throw challengeListError;
  const chosen =
    challengeRows?.find((challenge) => String(challenge.id) === challengeId) ??
    challengeRows?.find((challenge) => challenge.is_active) ??
    challengeRows?.[0];
  const operators = await getOperatorChoices();
  if (!chosen) {
    return {
      demo: false,
      session,
      challenge: null,
      habit: [],
      weeklyPenalty: { missedCount: 0, amount: 0, participantCount: 0 },
      challenges: [],
      operators,
      participants: [],
      today: [],
      metrics: { totalParticipants: 0, paidCount: 0, unpaidCount: 0, todayCompleted: 0, todayPending: 0, todayMissed: 0, monthMissed: 0, monthPenalty: 0, monthLinks: 0 },
      matrix: [],
      submissions: [],
      exemptions: [],
      excludedDates: [],
      penaltyRates: [],
      notices: [],
      auditLogs: [],
      month: selectedMonth,
    };
  }
  const challengeIdNumber = chosen.id;
  const results = await Promise.all([
    db.from("participants").select("id,name,affiliation,joined_at,left_at,paid_amount,paid_at,refunded_amount,is_active").eq("challenge_id", challengeIdNumber).order("name"),
    db.from("submissions").select("id,participant_id,title,url,description,submitted_at,is_featured").eq("challenge_id", challengeIdNumber).order("submitted_at", { ascending: false }),
    db.from("exemptions").select("id,participant_id,exemption_date,reason").eq("challenge_id", challengeIdNumber).order("exemption_date", { ascending: false }),
    db.from("excluded_dates").select("id,excluded_date,reason,source").eq("challenge_id", challengeIdNumber).order("excluded_date"),
    db.from("penalty_rates").select("id,amount,effective_from").eq("challenge_id", challengeIdNumber).order("effective_from"),
    db.from("notices").select("id,title,content,is_pinned,created_at").eq("challenge_id", challengeIdNumber).order("is_pinned", { ascending: false }).order("created_at", { ascending: false }),
    db.from("audit_logs").select("id,operator_id,action,entity_type,entity_id,created_at").eq("challenge_id", challengeIdNumber).order("created_at", { ascending: false }).limit(200),
  ]);
  const firstError = results.find((result) => result.error)?.error;
  if (firstError) throw firstError;
  const participantRows = results[0].data ?? [];
  const submissionRows = results[1].data ?? [];
  const exemptionRows = results[2].data ?? [];
  const excludedRows = results[3].data ?? [];
  const rateRows = results[4].data ?? [];
  const noticeRows = results[5].data ?? [];
  const auditRows = results[6].data ?? [];
  const reminderResult = participantRows.length
    ? await db
        .from("push_reminders")
        .select("participant_id,reminder_time,last_attempt_at,last_delivery_status,last_response_status,last_error,last_sent_date,created_at")
        .in("participant_id", participantRows.map((row) => row.id))
        .is("disabled_at", null)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (reminderResult.error) throw reminderResult.error;
  const reminderRows = (reminderResult.data ?? []) as ReminderAdminRow[];
  const remindersByParticipant = new Map<number, ReminderAdminRow[]>();
  for (const reminder of reminderRows) {
    const group = remindersByParticipant.get(reminder.participant_id) ?? [];
    group.push(reminder);
    remindersByParticipant.set(reminder.participant_id, group);
  }
  const participantName = new Map(participantRows.map((row) => [row.id, row.name]));
  const operatorName = new Map(operators.map((operator) => [operator.id, operator.name]));
  const submissions: Submission[] = submissionRows.map((row) => ({
    id: String(row.id),
    participantId: String(row.participant_id),
    participantName: participantName.get(row.participant_id) ?? "참가자",
    title: row.title,
    url: row.url,
    description: row.description,
    submittedAt: row.submitted_at,
    isFeatured: row.is_featured,
  }));
  const excludedDates = new Set(excludedRows.map((row) => row.excluded_date));
  const rates = rateRows.map((row) => ({ effectiveFrom: row.effective_from, amount: Number(row.amount) }));
  const days = dateKeysInMonth(selectedMonth);
  const monthlyPenaltyByParticipant = new Map<string, number>();
  const habit: AdminData["habit"] = [];
  const currentWeek = new Set(weekDates(today));
  const weeklyPenalty = { missedCount: 0, amount: 0, participantCount: 0 };
  const participants = participantRows.map((row) => {
    const id = String(row.id);
    const participantSubmissions = submissions
      .filter((submission) => submission.participantId === id)
      .map((submission) => submission.submittedAt);
    const exemptionDates = new Set(
      exemptionRows
        .filter((exemption) => exemption.participant_id === row.id)
        .map((exemption) => exemption.exemption_date),
    );
    const allStatuses = calculateParticipantStatuses({
      now,
      joinedAt: row.joined_at,
      leftAt: row.left_at,
      challengeStart: chosen.start_date,
      challengeEnd: chosen.end_date,
      penaltyStart: chosen.penalty_start_date,
      excludedDates,
      exemptionDates,
      submittedAt: participantSubmissions,
    });
    const monthly = allStatuses.filter((item) => item.date.startsWith(selectedMonth));
    habit.push({ participantId: id, name: row.name, active: row.is_active && row.joined_at <= today && (!row.left_at || today < row.left_at) && chosen.start_date <= today && today <= chosen.end_date,
      recentMisses: recentMisses(allStatuses),
      week: weekDates(today).map((date) => ({ date, status: allStatuses.find((day) => day.date === date)?.status ?? (date > today ? "future" : "not_enrolled") })),
    });
    monthlyPenaltyByParticipant.set(id, calculatePenalty(monthly, rates));
    const weekMissed = allStatuses.filter((item) => currentWeek.has(item.date) && item.status === "missed");
    if (weekMissed.length > 0) {
      weeklyPenalty.missedCount += weekMissed.length;
      weeklyPenalty.amount += calculatePenalty(weekMissed, rates);
      weeklyPenalty.participantCount += 1;
    }
    const summary = summarizeStatuses(monthly.map((item) => item.status));
    const penaltyAmount = calculatePenalty(allStatuses, rates);
    const paidAmount = Number(row.paid_amount);
    return {
      id,
      name: row.name,
      affiliation: row.affiliation,
      joinedAt: row.joined_at,
      leftAt: row.left_at,
      paidAmount,
      paidAt: row.paid_at,
      paymentStatus: paymentStatusFor({
        paidAmount,
        paidAt: row.paid_at,
        fee: Number(chosen.default_fee),
      }),
      refundedAmount: row.refunded_amount === null ? null : Number(row.refunded_amount),
      isActive: row.is_active,
      ...summary,
      totalLinks: submissions.filter(
        (submission) =>
          submission.participantId === id &&
          kstDateKey(submission.submittedAt).startsWith(selectedMonth),
      ).length,
      streak: calculateStreak(allStatuses.map((item) => item.status)),
      penaltyAmount,
      expectedRefund: paidAmount - penaltyAmount,
    };
  });
  const matrix = participantRows.map((row) => {
    const id = String(row.id);
    const submittedAt = submissions
      .filter((submission) => submission.participantId === id)
      .map((submission) => submission.submittedAt);
    const exemptionDates = new Set(
      exemptionRows.filter((item) => item.participant_id === row.id).map((item) => item.exemption_date),
    );
    return {
      participantId: id,
      name: row.name,
      days: Object.fromEntries(
        days.map((date) => [
          date,
          evaluateDailyStatus({
            dateKey: date,
            now,
            joinedAt: row.joined_at,
            leftAt: row.left_at,
            challengeStart: chosen.start_date,
            challengeEnd: chosen.end_date,
            penaltyStart: chosen.penalty_start_date,
            excludedDates,
            exemptionDates,
            submittedAt,
          }),
        ]),
      ) as Record<string, DailyStatus>,
    };
  });
  const todayRows = participantRows.map((row) => {
    const participantId = String(row.id);
    const reminders = remindersByParticipant.get(row.id) ?? [];
    const latestReminder = reminders[0];
    return {
      participantId,
      name: row.name,
      status: evaluateDailyStatus({
        dateKey: today,
        now,
        joinedAt: row.joined_at,
        leftAt: row.left_at,
        challengeStart: chosen.start_date,
        challengeEnd: chosen.end_date,
        penaltyStart: chosen.penalty_start_date,
        excludedDates,
        exemptionDates: new Set(
          exemptionRows
            .filter((item) => item.participant_id === row.id)
            .map((item) => item.exemption_date),
        ),
        submittedAt: submissions
          .filter((submission) => submission.participantId === participantId)
          .map((submission) => submission.submittedAt),
      }),
      linkCount: submissions.filter(
        (submission) =>
          submission.participantId === participantId &&
          kstDateKey(submission.submittedAt) === today,
      ).length,
      reminder: latestReminder
        ? {
            deviceCount: reminders.length,
            time: latestReminder.reminder_time,
            lastAttemptAt: latestReminder.last_attempt_at,
            lastDeliveryStatus: latestReminder.last_delivery_status,
            lastResponseStatus: latestReminder.last_response_status,
            lastError: latestReminder.last_error,
            lastSentDate: latestReminder.last_sent_date,
          }
        : null,
    };
  });
  return {
    demo: false,
    session,
    habit,
    weeklyPenalty,
    challenge: {
      id: String(chosen.id),
      name: chosen.name,
      startDate: chosen.start_date,
      endDate: chosen.end_date,
      penaltyStartDate: chosen.penalty_start_date,
      defaultFee: Number(chosen.default_fee),
      defaultPenalty: Number(chosen.default_penalty),
      isActive: chosen.is_active,
    },
    challenges: (challengeRows ?? []).map((row) => ({
      id: String(row.id),
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      penaltyStartDate: row.penalty_start_date,
      defaultFee: Number(row.default_fee),
      defaultPenalty: Number(row.default_penalty),
      isActive: row.is_active,
    })),
    operators,
    participants,
    today: todayRows,
    metrics: {
      totalParticipants: participants.filter((participant) => participant.isActive).length,
      paidCount: participants.filter((participant) => participant.paymentStatus === "paid").length,
      unpaidCount: participants.filter((participant) => participant.paymentStatus === "unpaid").length,
      todayCompleted: todayRows.filter((row) => row.status === "completed").length,
      todayPending: todayRows.filter((row) => row.status === "pending").length,
      todayMissed: todayRows.filter((row) => row.status === "missed").length,
      monthMissed: participants.reduce((sum, participant) => sum + participant.missedDays, 0),
      monthPenalty: participants.reduce(
        (sum, participant) => sum + (monthlyPenaltyByParticipant.get(participant.id) ?? 0),
        0,
      ),
      monthLinks: submissions.filter((submission) => kstDateKey(submission.submittedAt).startsWith(selectedMonth)).length,
    },
    matrix,
    submissions,
    exemptions: exemptionRows.map((row) => ({
      id: String(row.id),
      participantId: String(row.participant_id),
      participantName: participantName.get(row.participant_id) ?? "참가자",
      date: row.exemption_date,
      reason: row.reason,
    })),
    excludedDates: excludedRows.map((row) => ({
      id: String(row.id),
      date: row.excluded_date,
      reason: row.reason,
      source: row.source,
    })),
    penaltyRates: rateRows.map((row) => ({
      id: String(row.id),
      amount: Number(row.amount),
      effectiveFrom: row.effective_from,
    })),
    notices: noticeRows.map((row) => ({
      id: String(row.id),
      title: row.title,
      content: row.content,
      isPinned: row.is_pinned,
      createdAt: row.created_at,
    })),
    auditLogs: auditRows.map((row) => ({
      id: String(row.id),
      operatorName: operatorName.get(String(row.operator_id)) ?? "운영자",
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      createdAt: row.created_at,
    })),
    month: selectedMonth,
  };
}

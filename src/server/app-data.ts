import "server-only";
import { groupParticipants } from "@/lib/participant-groups";
import { buildChallengeProgress, buildPersonalProgress } from "@/lib/challenge-progress";
import { isVoluntarySharingChallenge } from "@/lib/participation";
import { recentMisses, weekDates } from "@/lib/habits";

import {
  calculateBestStreak,
  calculateCompletionRate,
  calculateParticipantStatuses,
  calculateStreak,
  daysUntil,
  penaltyPhaseFor,
  penaltyRateForDate,
  summarizeStatuses,
} from "@/lib/business";
import {
  dateKeysInMonth,
  kstDateKey,
} from "@/lib/time";
import type {
  AppData,
  Challenge,
  Participant,
  Submission,
} from "@/lib/types";
import { dashboardExpiry, dashboardSnapshot } from "@/server/dashboard-cache";
import { getSupabaseAdmin, isDemoMode } from "@/server/supabase";

type ChallengeRow = {
  id: number | string;
  name: string;
  start_date: string;
  end_date: string;
  penalty_start_date?: string;
};
type ParticipantRow = {
  id: number | string;
  name: string;
  affiliation?: string;
  joined_at: string;
  left_at: string | null;
  is_active: boolean;
};
type SubmissionRow = {
  html_file_name?: string | null;
  updated_at?: string;
  id: number | string;
  participant_id: number | string;
  title: string | null;
  url: string;
  description: string | null;
  submitted_at: string;
  is_featured: boolean;
};
type ExemptionRow = { participant_id: number | string; exemption_date: string };
type ExcludedRow = { excluded_date: string };
type NoticeRow = {
  id: number | string;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
};

type AppQuery = {
  participantId?: string | null;
  date?: string;
  month?: string;
  search?: string;
  featuredOnly?: boolean;
};

function toChallenge(row: ChallengeRow): Challenge {
  return {
    id: String(row.id),
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    penaltyStartDate: row.penalty_start_date ?? row.start_date,
  };
}

function toParticipant(row: ParticipantRow): Participant {
  return {
    id: String(row.id),
    name: row.name,
    affiliation: row.affiliation ?? "",
    joinedAt: row.joined_at,
    leftAt: row.left_at,
  };
}

function previousMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function prepareStatistics(
  now: Date, challengeRow: ChallengeRow, participantRows: ParticipantRow[],
  submissionRows: SubmissionRow[], exemptions: ExemptionRow[], excludedRows: ExcludedRow[],
  sharingParticipants: ParticipantRow[],
) {
  const today = kstDateKey(now);
  const challenge = toChallenge(challengeRow);
  const submissions = submissionRows.map((row) => ({
    id: String(row.id), participantId: String(row.participant_id), submittedAt: row.submitted_at,
  }));
  const excludedDates = new Set(excludedRows.map((item) => item.excluded_date));
  const exemptionMap = new Map<string, Set<string>>();
  for (const exemption of exemptions) {
    const participantId = String(exemption.participant_id);
    const set = exemptionMap.get(participantId) ?? new Set<string>();
    set.add(exemption.exemption_date);
    exemptionMap.set(participantId, set);
  }
  const submissionMap = new Map<string, string[]>();
  for (const submission of submissions) {
    const list = submissionMap.get(submission.participantId) ?? [];
    list.push(submission.submittedAt);
    submissionMap.set(submission.participantId, list);
  }

  const participantGrowth = participantRows.map((row) => {
    const participant = toParticipant(row);
    const allStatuses = calculateParticipantStatuses({
      now,
      joinedAt: participant.joinedAt,
      leftAt: participant.leftAt,
      challengeStart: challenge.startDate,
      challengeEnd: challenge.endDate,
      penaltyStart: challenge.penaltyStartDate,
      excludedDates,
      exemptionDates: exemptionMap.get(participant.id) ?? new Set(),
      submittedAt: submissionMap.get(participant.id) ?? [],
    });
    return {
      participantId: participant.id,
      allStatuses,
    };
  });

  const progress = buildChallengeProgress({
    challenge, today, participantId: "", histories: participantGrowth, submissions, excludedDates,
  });
  const submissionDates = Object.fromEntries(submissions.map((row) => [row.id, kstDateKey(row.submittedAt)]));
  const personalProgress = Object.fromEntries([...participantRows, ...sharingParticipants].map((row) => {
    const id = String(row.id);
    return [id, buildPersonalProgress(
      participantGrowth.find((item) => item.participantId === id)?.allStatuses.map((day) => day.status) ?? [],
      submissions.filter((item) => item.participantId === id).map((item) => submissionDates[item.id]),
      challenge, today,
    )];
  }));
  const crewParticipantCount = participantGrowth.filter((entry) =>
    entry.allStatuses.some((item) => item.status !== "not_enrolled" && item.status !== "future"),
  ).length;
  return { participantGrowth, progress, personalProgress, submissionDates, crewParticipantCount };
}

function buildData(
  query: AppQuery,
  now: Date,
  challengeRow: ChallengeRow,
  participantRows: ParticipantRow[],
  submissionRows: SubmissionRow[],
  exemptions: ExemptionRow[],
  excludedRows: ExcludedRow[],
  noticeRows: NoticeRow[],
  demo: boolean,
  penaltyRates: Array<{ effective_from: string; amount: number }> = [],
  sharingParticipants: ParticipantRow[] = [],
  prepared = prepareStatistics(now, challengeRow, participantRows, submissionRows, exemptions, excludedRows, sharingParticipants),
): AppData {
  const today = kstDateKey(now);
  const month = query.month ?? today.slice(0, 7);
  const feedDate = query.date ?? today;
  const challenge = toChallenge(challengeRow);
  const participants = [...participantRows.filter((participant) => participant.is_active), ...sharingParticipants].map(toParticipant);
  const selectedParticipant =
    participants.find((participant) => participant.id === query.participantId) ?? null;
  const sharingOnly = sharingParticipants.some((participant) => String(participant.id) === selectedParticipant?.id);
  const participantName = new Map(
    [...participantRows, ...sharingParticipants].map((participant) => [String(participant.id), participant.name]),
  );
  const submissions: Submission[] = submissionRows.map((submission) => ({
    id: String(submission.id),
    participantId: String(submission.participant_id),
    participantName: participantName.get(String(submission.participant_id)) ?? "참가자",
    title: submission.title,
    url: submission.html_file_name ? `/submissions/${submission.id}` : submission.url,
    htmlFileName: submission.html_file_name ?? null,
    htmlUpdatedAt: submission.html_file_name ? submission.updated_at ?? submission.submitted_at : null,
    description: submission.description,
    submittedAt: submission.submitted_at,
    isFeatured: submission.is_featured,
  }));
  const { participantGrowth, submissionDates, crewParticipantCount } = prepared;
  const selectedGrowth = participantGrowth.find((entry) => entry.participantId === selectedParticipant?.id);
  const selectedStatuses = new Map(selectedGrowth?.allStatuses.map((day) => [day.date, day.status]) ?? []);
  const progress = {
    ...prepared.progress,
    personal: prepared.personalProgress[selectedParticipant?.id ?? ""] ?? prepared.progress.personal,
  };

  const calendar = selectedParticipant
    ? dateKeysInMonth(month).map((date) => {
        const daySubmissions = submissions.filter(
          (submission) =>
            submission.participantId === selectedParticipant.id &&
            submissionDates[submission.id] === date,
        );
        return {
          date,
          day: Number(date.slice(-2)),
          status: selectedStatuses.get(date) ?? (date > today ? "future" as const : "not_enrolled" as const),
          submissions: daySubmissions,
        };
      })
    : [];

  const monthSummary = summarizeStatuses(calendar.map((day) => day.status));
  const normalizedSearch = query.search?.trim().toLocaleLowerCase("ko") ?? "";
  const feed = submissions
    .filter((submission) => feedDate === "all" || submissionDates[submission.id] === feedDate)
    .filter((submission) => !query.featuredOnly || submission.isFeatured)
    .filter(
      (submission) =>
        !normalizedSearch ||
        [submission.participantName, submission.title, submission.description]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase("ko").includes(normalizedSearch)),
    )
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const personalRecords = selectedParticipant
    ? submissions
        .filter((submission) => submission.participantId === selectedParticipant.id)
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    : [];

  const todayStatus = selectedStatuses.get(today) ?? "not_enrolled";
  const previousMonth = previousMonthKey(month);
  const previousMonthStatuses = selectedGrowth?.allStatuses
    .filter((item) => item.date.startsWith(previousMonth))
    .map((item) => item.status) ?? [];

  return {
    // The crew dashboard is useful before a participant is selected as well.
    // Its shared metrics do not depend on the personal participant id.
    progress,
    sharingOnly,
    demo,
    participantGroups: groupParticipants(
      [{ ...challengeRow, is_active: true }],
      participantRows.map((row) => ({ ...row, affiliation: row.affiliation ?? "", challenge_id: challengeRow.id })),
    ),
    habit: {
      week: weekDates(today).map((date) => ({ date, status: selectedGrowth?.allStatuses.find((day) => day.date === date)?.status ?? (date > today ? "future" : "not_enrolled") })),
      recentMisses: recentMisses(selectedGrowth?.allStatuses ?? []),
    },
    now: now.toISOString(),
    challenge,
    penaltyNotice: sharingOnly ? null : {
      phase: penaltyPhaseFor(today, challenge.penaltyStartDate),
      startDate: challenge.penaltyStartDate,
      daysUntilStart: daysUntil(today, challenge.penaltyStartDate),
      dailyAmount: penaltyRateForDate(
        challenge.penaltyStartDate,
        penaltyRates.map((rate) => ({ effectiveFrom: rate.effective_from, amount: Number(rate.amount) })),
      ),
    },
    participants,
    selectedParticipant,
    todayStatus,
    month,
    summary: {
      ...monthSummary,
      totalLinks: selectedParticipant
        ? submissions.filter(
            (submission) =>
              submission.participantId === selectedParticipant.id &&
              submissionDates[submission.id].startsWith(month),
          ).length
        : 0,
      streak: calculateStreak(selectedGrowth?.allStatuses.map((item) => item.status) ?? []),
      bestStreak: calculateBestStreak(selectedGrowth?.allStatuses.map((item) => item.status) ?? []),
      completionRate: calculateCompletionRate(calendar.map((day) => day.status)),
      previousMonthCompletionRate: calculateCompletionRate(previousMonthStatuses),
    },
    crewGrowth: {
      completionRate: progress.crew.completionRate,
      completedDays: progress.crew.completedDays,
      decidedDays: progress.crew.decidedDays,
      totalLinks: progress.crew.totalLinks,
      participantCount: crewParticipantCount,
      goalRate: progress.crew.goalRate,
    },
    calendar,
    feed,
    personalRecords,
    notices: noticeRows.map((notice) => ({
      id: String(notice.id),
      title: notice.title,
      content: notice.content,
      isPinned: notice.is_pinned,
      createdAt: notice.created_at,
    })),
  };
}

function demoRows(now: Date) {
  const today = kstDateKey(now);
  const currentMonth = today.slice(0, 7);
  const startDate = currentMonth === "2026-09" ? "2026-09-01" : `${currentMonth}-01`;
  const challenge: ChallengeRow = {
    id: 1,
    name: "2기",
    start_date: startDate,
    end_date: "2026-12-31",
    penalty_start_date: startDate,
  };
  const participants: ParticipantRow[] = [
    { id: 1, name: "김하늘", joined_at: startDate, left_at: null, is_active: true },
    { id: 2, name: "박지민", joined_at: startDate, left_at: null, is_active: true },
    { id: 3, name: "최유진", joined_at: startDate, left_at: null, is_active: true },
  ];
  const makeKstIso = (date: string, time: string) =>
    new Date(`${date}T${time}+09:00`).toISOString();
  const days = dateKeysInMonth(currentMonth).filter((date) => date <= today);
  const validDays = days.filter((date) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return weekday > 0 && weekday < 6;
  });
  const submissions: SubmissionRow[] = [];
  let id = 1;
  for (const [index, date] of validDays.entries()) {
    if (index % 3 !== 2) {
      submissions.push({
        id: id++,
        participant_id: 1,
        title: index === 0 ? "회의 자료를 한 장으로 요약하기" : "오늘의 AI 활용 기록",
        url: `https://chatgpt.com/share/demo-haneul-${date}`,
        description: index === 0 ? "길었던 회의 메모를 핵심 결정사항 중심으로 정리했어요." : null,
        submitted_at: makeKstIso(date, "21:24:00"),
        is_featured: index === 0,
      });
    }
    submissions.push({
      id: id++,
      participant_id: 2,
      title: "보고서 문장 다듬기",
      url: `https://claude.ai/share/demo-jimin-${date}`,
      description: "딱딱한 문장을 읽기 쉽게 바꿔봤습니다.",
      submitted_at: makeKstIso(date, "22:10:00"),
      is_featured: false,
    });
    if (index % 2 === 0) {
      submissions.push({
        id: id++,
        participant_id: 3,
        title: null,
        url: `https://gemini.google.com/share/demo-yujin-${date}`,
        description: null,
        submitted_at: makeKstIso(date, index === validDays.length - 1 ? "23:12:00" : "20:45:00"),
        is_featured: index === 2,
      });
    }
  }
  return {
    challenge,
    participants,
    submissions,
    exemptions: validDays[1] ? [{ participant_id: 1, exemption_date: validDays[1] }] : [],
    excluded: [] as ExcludedRow[],
    notices: [
      {
        id: 1,
        title: "이번 주 우수 프롬프트를 확인해보세요",
        content: "공유 화면에서 별표 필터를 누르면 운영자가 선정한 활용 사례만 볼 수 있어요.",
        is_pinned: true,
        created_at: now.toISOString(),
      },
    ],
  };
}

// Read every page so long-running challenges do not silently lose older records.
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const result = await page(from, from + size - 1);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < size) return { data: rows, error: null };
  }
}

export async function getAppData(query: AppQuery): Promise<AppData> {
  const now = new Date();
  if (isDemoMode()) {
    const rows = demoRows(now);
    const data = buildData(
      query,
      now,
      rows.challenge,
      rows.participants,
      rows.submissions,
      rows.exemptions,
      rows.excluded,
      rows.notices,
      true,
      [{ effective_from: rows.challenge.start_date, amount: 2000 }],
      [
        { id: 4, name: "이서연", joined_at: "2026-01-07", left_at: null, is_active: false },
        { id: 5, name: "정민수", joined_at: "2026-01-07", left_at: null, is_active: false },
      ],
    );
    data.participantGroups.push({
      id: "2", name: "1기", isActive: false,
      members: [
        { id: "4", name: "이서연", affiliation: "", selectable: true },
        { id: "5", name: "정민수", affiliation: "", selectable: true },
      ],
    });
    return data;
  }

  const snapshot = await dashboardSnapshot(async (at) => {
    const value = await loadDashboard(at);
    return { value, validUntil: value?.validUntil ?? dashboardExpiry(at) };
  });
  const rows = snapshot.value;
  const challenge = rows?.challenge;
  if (!challenge) {
    return {
      progress: null,
      sharingOnly: false,
      demo: false,
      habit: { week: [], recentMisses: 0 },
      now: snapshot.now.toISOString(),
      challenge: null,
      penaltyNotice: null,
      participants: [],
      participantGroups: [],
      selectedParticipant: null,
      todayStatus: "not_enrolled",
      month: query.month ?? kstDateKey(snapshot.now).slice(0, 7),
      summary: {
        completedDays: 0,
        missedDays: 0,
        exemptDays: 0,
        totalLinks: 0,
        streak: 0,
        bestStreak: 0,
        completionRate: null,
        previousMonthCompletionRate: null,
      },
      crewGrowth: {
        completionRate: null,
        completedDays: 0,
        decidedDays: 0,
        totalLinks: 0,
        participantCount: 0,
        goalRate: 90,
      },
      calendar: [],
      feed: [],
      personalRecords: [],
      notices: [],
    };
  }
  if (!rows) throw new Error("Missing dashboard snapshot");
  const data = buildData(
    query, snapshot.now, rows.challenge, rows.participants, rows.submissions,
    rows.exemptions, rows.excluded, rows.notices, false,
    rows.penaltyRates, rows.sharingParticipants, rows.prepared,
  );
  data.participantGroups = rows.participantGroups;
  return data;
}

async function loadDashboard(now: Date) {
  const db = getSupabaseAdmin();
  const { data: challenge, error: challengeError } = await db
    .from("challenges")
    .select("id,name,start_date,end_date,penalty_start_date")
    .eq("is_active", true)
    .maybeSingle();
  if (challengeError) throw challengeError;
  if (!challenge) return null;

  const challengeId = challenge.id;
  const [{ data: rosterChallenges, error: rosterChallengeError }, { data: rosterMembers, error: rosterMemberError }] = await Promise.all([
    db.from("challenges").select("id,name,is_active,start_date,end_date").lte("start_date", kstDateKey(now)),
    db.from("participants").select("id,challenge_id,name,affiliation,is_active,joined_at,left_at").order("name"),
  ]);
  if (rosterChallengeError) throw rosterChallengeError;
  if (rosterMemberError) throw rosterMemberError;
  const sharingChallengeIds = (rosterChallenges ?? [])
    .filter((row) => isVoluntarySharingChallenge(row, kstDateKey(now))).map((row) => row.id);
  const sharingParticipants = (rosterMembers ?? []).filter((row) => sharingChallengeIds.includes(row.challenge_id));
  const [{ data: participants, error: participantsError }, { data: submissions, error: submissionsError }, { data: exemptions, error: exemptionsError }, { data: excluded, error: excludedError }, { data: notices, error: noticesError }] =
    await Promise.all([
      db.from("participants").select("id,name,affiliation,joined_at,left_at,is_active").eq("challenge_id", challengeId).order("name"),
      allRows((from, to) => db.from("submissions").select("id,participant_id,title,url,description,submitted_at,is_featured,html_file_name,updated_at").in("challenge_id", [challengeId, ...sharingChallengeIds]).gte("submitted_at", new Date(`${challenge.start_date}T00:00:00+09:00`).toISOString()).order("submitted_at").order("id").range(from, to)),
      allRows((from, to) => db.from("exemptions").select("participant_id,exemption_date").eq("challenge_id", challengeId).order("id").range(from, to)),
      db.from("excluded_dates").select("excluded_date").eq("challenge_id", challengeId),
      db.from("notices").select("id,title,content,is_pinned,created_at").eq("challenge_id", challengeId).order("is_pinned", { ascending: false }).order("created_at", { ascending: false }),
    ]);
  const firstError = participantsError ?? submissionsError ?? exemptionsError ?? excludedError ?? noticesError;
  if (firstError) throw firstError;
  const { data: penaltyRates, error: penaltyRateError } = await db
    .from("penalty_rates")
    .select("amount,effective_from")
    .eq("challenge_id", challengeId)
    .order("effective_from");
  if (penaltyRateError) throw penaltyRateError;
  const visibleSubmissions = (submissions ?? []).filter((row) => Date.parse(row.submitted_at) <= now.getTime());
  return {
    challenge, participants: participants ?? [], submissions: visibleSubmissions,
    exemptions: exemptions ?? [], excluded: excluded ?? [], notices: notices ?? [],
    penaltyRates: penaltyRates ?? [], sharingParticipants,
    participantGroups: groupParticipants(rosterChallenges ?? [], rosterMembers ?? []),
    prepared: prepareStatistics(now, challenge, participants ?? [], visibleSubmissions, exemptions ?? [], excluded ?? [], sharingParticipants),
    validUntil: dashboardExpiry(now, (submissions ?? []).map((row) => row.submitted_at)),
  };
}

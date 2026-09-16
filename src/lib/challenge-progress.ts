import { calculateCompletionRate, calculateStreak } from "@/lib/business";
import { dateKeysBetween, isSubmissionOnTime, isWeekend, kstDateKey } from "@/lib/time";
import type { ActivityDay, Challenge, ChallengeProgress, DailyStatus, Submission } from "@/lib/types";

type ParticipantHistory = {
  participantId: string;
  allStatuses: Array<{ date: string; status: DailyStatus }>;
};

export function buildChallengeProgress({ challenge, today, participantId, histories, submissions, excludedDates }: {
  challenge: Challenge;
  today: string;
  participantId: string;
  histories: ParticipantHistory[];
  submissions: Pick<Submission, "participantId" | "submittedAt">[];
  excludedDates: Set<string>;
}): ChallengeProgress {
  const ownStatuses = histories.find((item) => item.participantId === participantId)?.allStatuses ?? [];
  const crewIds = new Set(histories.map((item) => item.participantId));
  const personalCounts = new Map<string, number>();
  const crewCounts = new Map<string, number>();
  const contributors = new Map<string, Set<string>>();
  let crewTotalLinks = 0;
  for (const submission of submissions) {
    const date = kstDateKey(submission.submittedAt);
    if (date < challenge.startDate || date > challenge.endDate || date > today) continue;
    if (crewIds.has(submission.participantId) && isSubmissionOnTime(submission.submittedAt) && !isWeekend(date) && !excludedDates.has(date)) {
      crewTotalLinks += 1;
      crewCounts.set(date, (crewCounts.get(date) ?? 0) + 1);
      const members = contributors.get(date) ?? new Set<string>();
      members.add(submission.participantId);
      contributors.set(date, members);
    }
    if (submission.participantId === participantId) personalCounts.set(date, (personalCounts.get(date) ?? 0) + 1);
  }
  const activity = dateKeysBetween(challenge.startDate, challenge.endDate).map((date) => ({
    date,
    count: crewCounts.get(date) ?? 0,
    participantCount: contributors.get(date)?.size ?? 0,
  } satisfies ActivityDay));
  const personalStatuses = ownStatuses.map((day) => day.status);
  const crewStatuses = histories.flatMap((item) => item.allStatuses.map((day) => day.status));
  const crewCompleted = crewStatuses.filter((status) => status === "completed").length;
  const todayStatuses = histories.flatMap((item) => item.allStatuses.filter((day) => day.date === today).map((day) => day.status));
  const completed = todayStatuses.filter((status) => status === "completed").length;
  const pending = todayStatuses.filter((status) => status === "pending").length;
  const missed = todayStatuses.filter((status) => status === "missed").length;
  return {
    personal: {
      completedDays: personalStatuses.filter((status) => status === "completed").length,
      completionRate: calculateCompletionRate(personalStatuses),
      totalLinks: [...personalCounts.values()].reduce((total, count) => total + count, 0),
      activeDays: personalCounts.size,
      streak: calculateStreak(personalStatuses),
    },
    crew: {
      activeDays: crewCounts.size,
      today: { completed, pending, missed, exempt: todayStatuses.filter((status) => status === "exempt").length, target: completed + pending + missed },
      completionRate: calculateCompletionRate(crewStatuses),
      completedDays: crewCompleted,
      decidedDays: crewCompleted + crewStatuses.filter((status) => status === "missed").length,
      totalLinks: crewTotalLinks,
      goalRate: 90,
    },
    activity,
  };
}

export function challengeTimeline(challenge: Challenge, today: string) {
  const total = dateKeysBetween(challenge.startDate, challenge.endDate).length;
  const elapsed = today < challenge.startDate ? 0 : dateKeysBetween(challenge.startDate, today < challenge.endDate ? today : challenge.endDate).length;
  return { total, elapsed, percent: total === 0 ? 0 : Math.round(elapsed / total * 100) };
}

// Columns run Monday–Sunday, including padding at the start/end of the challenge.
export function activityWeeks(days: ActivityDay[]) {
  if (days.length === 0) return [];
  const offset = (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return Array.from({ length: Math.ceil((offset + days.length) / 7) }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => days[week * 7 + day - offset] ?? null),
  );
}

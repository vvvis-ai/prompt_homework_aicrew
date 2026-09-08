import type { DailyStatus } from "@/lib/types";
import {
  dateKeysBetween,
  isMissConfirmed,
  isSubmissionOnTime,
  isWeekend,
  kstDateKey,
} from "@/lib/time";

export type StatusInput = {
  dateKey: string;
  now: Date | string;
  joinedAt: string;
  leftAt: string | null;
  challengeStart: string;
  challengeEnd: string;
  excludedDates: Set<string>;
  exemptionDates: Set<string>;
  submittedAt: string[];
};

export function evaluateDailyStatus(input: StatusInput): DailyStatus {
  const today = kstDateKey(input.now);
  if (input.dateKey > today) return "future";
  if (
    input.dateKey < input.joinedAt ||
    input.dateKey < input.challengeStart ||
    input.dateKey > input.challengeEnd ||
    (input.leftAt !== null && input.dateKey >= input.leftAt)
  ) {
    return "not_enrolled";
  }
  if (isWeekend(input.dateKey) || input.excludedDates.has(input.dateKey)) return "excluded";
  if (input.exemptionDates.has(input.dateKey)) return "exempt";
  if (
    input.submittedAt.some(
      (submittedAt) =>
        kstDateKey(submittedAt) === input.dateKey && isSubmissionOnTime(submittedAt),
    )
  ) {
    return "completed";
  }
  if (input.dateKey === today && !isMissConfirmed(input.now)) return "pending";
  return "missed";
}

export function summarizeStatuses(statuses: DailyStatus[]) {
  return {
    completedDays: statuses.filter((status) => status === "completed").length,
    missedDays: statuses.filter((status) => status === "missed").length,
    exemptDays: statuses.filter((status) => status === "exempt").length,
  };
}

export function calculateStreak(statuses: DailyStatus[]): number {
  let streak = 0;
  for (const status of statuses) {
    if (status === "completed") streak += 1;
    if (status === "missed") streak = 0;
  }
  return streak;
}

export function calculateBestStreak(statuses: DailyStatus[]): number {
  let streak = 0;
  let bestStreak = 0;
  for (const status of statuses) {
    if (status === "completed") {
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    }
    if (status === "missed") streak = 0;
  }
  return bestStreak;
}

export function calculateCompletionRate(statuses: DailyStatus[]): number | null {
  const completedDays = statuses.filter((status) => status === "completed").length;
  const decidedDays = completedDays + statuses.filter((status) => status === "missed").length;
  return decidedDays === 0 ? null : Math.round((completedDays / decidedDays) * 100);
}

export function calculateParticipantStatuses(
  input: Omit<StatusInput, "dateKey"> & { from?: string; to?: string },
): Array<{ date: string; status: DailyStatus }> {
  const today = kstDateKey(input.now);
  const start = input.from ?? input.challengeStart;
  const end = [input.to ?? today, input.challengeEnd, today].sort()[0];
  if (start > end) return [];
  return dateKeysBetween(start, end).map((dateKey) => ({
    date: dateKey,
    status: evaluateDailyStatus({ ...input, dateKey }),
  }));
}

export function penaltyRateForDate(
  dateKey: string,
  rates: Array<{ effectiveFrom: string; amount: number }>,
): number {
  return [...rates]
    .filter((rate) => rate.effectiveFrom <= dateKey)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]?.amount ?? 0;
}

export function calculatePenalty(
  statuses: Array<{ date: string; status: DailyStatus }>,
  rates: Array<{ effectiveFrom: string; amount: number }>,
): number {
  return statuses.reduce(
    (sum, item) =>
      item.status === "missed" ? sum + penaltyRateForDate(item.date, rates) : sum,
    0,
  );
}


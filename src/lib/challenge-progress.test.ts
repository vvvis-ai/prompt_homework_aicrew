import { describe, expect, it } from "vitest";
import { activityWeeks, buildChallengeProgress, challengeTimeline } from "./challenge-progress";
import type { Challenge, DailyStatus } from "./types";

const challenge: Challenge = { id: "1", name: "2기", startDate: "2026-09-01", endDate: "2026-09-30", penaltyStartDate: "2026-09-14" };
const histories = [{ participantId: "me", allStatuses: [
  { date: "2026-09-13", status: "excluded" as DailyStatus },
  { date: "2026-09-14", status: "completed" as DailyStatus },
  { date: "2026-09-15", status: "exempt" as DailyStatus },
  { date: "2026-09-16", status: "pending" as DailyStatus },
] }];

describe("챌린지 전체 기간 활동", () => {
  it("한국 날짜로 링크를 세고 휴일·늦은 공유는 크루 활동에서 제외한다", () => {
    const result = buildChallengeProgress({ challenge, excludedDates: new Set(), today: "2026-09-16", participantId: "me", histories, submissions: [
      { participantId: "me", submittedAt: "2026-09-12T15:00:00Z" },
      { participantId: "me", submittedAt: "2026-09-14T13:00:00Z" },
      { participantId: "me", submittedAt: "2026-09-14T14:30:00Z" },
      { participantId: "other-cohort", submittedAt: "2026-09-14T13:00:00Z" },
      { participantId: "me", submittedAt: "2026-08-30T13:00:00Z" },
      { participantId: "me", submittedAt: "2026-10-01T13:00:00Z" },
    ] });
    expect(result.personal).toEqual({ completedDays: 1, completionRate: 100, totalLinks: 3, activeDays: 2, streak: 1 });
    expect(result.crew).toMatchObject({ totalLinks: 1, activeDays: 1, completedDays: 1, decidedDays: 1, completionRate: 100 });
    expect(result.activity.find((day) => day.date === "2026-09-13")).toEqual({ date: "2026-09-13", count: 0, participantCount: 0 });
    expect(result.activity.at(-1)).toEqual({ date: "2026-09-30", count: 0, participantCount: 0 });
  });

  it("기록이 없으면 제출률을 0%로 단정하지 않는다", () => {
    const result = buildChallengeProgress({ challenge, excludedDates: new Set(), today: "2026-08-30", participantId: "me", histories: [], submissions: [] });
    expect(result.personal.completionRate).toBeNull();
    expect(result.crew.completionRate).toBeNull();
    expect(result.crew.today).toEqual({ completed: 0, pending: 0, missed: 0, exempt: 0, target: 0 });
    expect(result.activity.every((day) => day.participantCount === 0 && day.count === 0)).toBe(true);
  });

  it("확정 제출률이 100%여도 오늘 대기 인원은 별도로 보여준다", () => {
    const result = buildChallengeProgress({ challenge, excludedDates: new Set(), today: "2026-09-16", participantId: "me", histories, submissions: [] });
    expect(result.crew.completionRate).toBe(100);
    expect(result.crew.today).toEqual({ completed: 0, pending: 1, missed: 0, exempt: 0, target: 1 });
  });

  it("오늘의 대상은 완료·대기·미제출만 합산하고 면제·휴일·비참여자는 제외한다", () => {
    const statuses: DailyStatus[] = ["completed", "pending", "missed", "exempt", "excluded", "not_enrolled", "future"];
    const result = buildChallengeProgress({
      challenge, excludedDates: new Set(), today: "2026-09-16", participantId: "0", submissions: [],
      histories: statuses.map((status, index) => ({ participantId: String(index), allStatuses: [{ date: "2026-09-16", status }] })),
    });
    expect(result.crew.today).toEqual({ completed: 1, pending: 1, missed: 1, exempt: 1, target: 3 });
  });

  it("전체 참가자의 링크를 합산하고 같은 날 여러 번 공유한 사람은 한 명으로 센다", () => {
    const input = {
      challenge, excludedDates: new Set<string>(), today: "2026-09-16",
      histories: [...histories, { participantId: "crew-mate", allStatuses: [] }],
      submissions: [
        { participantId: "me", submittedAt: "2026-09-14T13:00:00Z" },
        { participantId: "crew-mate", submittedAt: "2026-09-14T13:30:00Z" },
        { participantId: "crew-mate", submittedAt: "2026-09-14T14:30:00Z" },
        { participantId: "crew-mate", submittedAt: "2026-09-15T03:00:00Z" },
        { participantId: "other-cohort", submittedAt: "2026-09-14T13:00:00Z" },
      ],
    };
    const mine = buildChallengeProgress({ ...input, participantId: "me" });
    const theirs = buildChallengeProgress({ ...input, participantId: "crew-mate" });
    expect(mine.activity).toEqual(theirs.activity);
    expect(mine.crew).toEqual(theirs.crew);
    expect(mine.crew).toMatchObject({ totalLinks: 3, activeDays: 2 });
    expect(mine.activity.find((day) => day.date === "2026-09-14")).toEqual({ date: "2026-09-14", count: 2, participantCount: 2 });
    expect(mine.personal.totalLinks).toBe(1);
    expect(theirs.personal.totalLinks).toBe(3);
    expect(mine.activity.reduce((sum, day) => sum + day.count, 0)).toBe(mine.crew.totalLinks);
  });

  it("주별 격자는 월요일부터 정렬하고 모든 날짜를 한 번씩 담는다", () => {
    const result = buildChallengeProgress({ challenge, excludedDates: new Set(), today: "2026-09-16", participantId: "me", histories, submissions: [] });
    const weeks = activityWeeks(result.activity);
    expect(weeks[0][0]).toBeNull();
    expect(weeks[0][1]?.date).toBe("2026-09-01");
    expect(weeks.flat().filter(Boolean)).toEqual(result.activity);
    expect(activityWeeks([])).toEqual([]);
  });

  it("23:00:59는 포함하고 23:01부터 제외하며 주말·공휴일·운영 제외일도 집계하지 않는다", () => {
    const result = buildChallengeProgress({
      challenge, today: "2026-09-30", participantId: "me", histories,
      excludedDates: new Set(["2026-09-15", "2026-09-24"]),
      submissions: [
        { participantId: "me", submittedAt: "2026-09-14T23:00:59.999+09:00" },
        { participantId: "me", submittedAt: "2026-09-14T23:01:00+09:00" },
        { participantId: "me", submittedAt: "2026-09-16T23:01:00+09:00" },
        { participantId: "me", submittedAt: "2026-09-12T12:00:00+09:00" },
        { participantId: "me", submittedAt: "2026-09-13T12:00:00+09:00" },
        { participantId: "me", submittedAt: "2026-09-15T12:00:00+09:00" },
        { participantId: "me", submittedAt: "2026-09-24T12:00:00+09:00" },
      ],
    });
    expect(result.crew).toMatchObject({ totalLinks: 1, activeDays: 1 });
    expect(result.activity.filter((day) => day.count > 0)).toEqual([{ date: "2026-09-14", count: 1, participantCount: 1 }]);
    expect(result.activity.filter((day) => day.count === 0).every((day) => day.participantCount === 0)).toBe(true);
  });

  it.each([
    ["2026-08-31", 0, 0], ["2026-09-01", 1, 3], ["2026-09-16", 16, 53],
    ["2026-09-30", 30, 100], ["2026-10-01", 30, 100],
  ])("기간 경과는 한국 날짜 %s를 기준으로 계산한다", (today, elapsed, percent) => {
    expect(challengeTimeline(challenge, today)).toEqual({ total: 30, elapsed, percent });
  });
});

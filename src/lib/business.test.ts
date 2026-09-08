import { describe, expect, it } from "vitest";
import {
  calculateBestStreak,
  calculateCompletionRate,
  calculatePenalty,
  calculateStreak,
  evaluateDailyStatus,
  penaltyRateForDate,
} from "@/lib/business";
import {
  canParticipantEdit,
  isMissConfirmed,
  isSubmissionOnTime,
  kstDateKey,
} from "@/lib/time";
import { normalizeUrl } from "@/lib/url";

const base = {
  dateKey: "2026-09-03",
  joinedAt: "2026-09-01",
  leftAt: null,
  challengeStart: "2026-09-01",
  challengeEnd: "2026-12-31",
  excludedDates: new Set<string>(),
  exemptionDates: new Set<string>(),
};

describe("KST 마감 규칙", () => {
  it("23:00:59는 인정하고 23:01:00은 인정하지 않는다", () => {
    expect(isSubmissionOnTime("2026-09-03T14:00:59.999Z")).toBe(true);
    expect(isSubmissionOnTime("2026-09-03T14:01:00.000Z")).toBe(false);
  });

  it("23:01:00부터 미제출을 확정한다", () => {
    expect(isMissConfirmed("2026-09-03T14:00:59.999Z")).toBe(false);
    expect(isMissConfirmed("2026-09-03T14:01:00.000Z")).toBe(true);
  });

  it("수정 삭제는 등록 당일 제출 마감 전까지만 허용한다", () => {
    expect(canParticipantEdit("2026-09-03T13:50:00Z", "2026-09-03T14:00:59Z")).toBe(true);
    expect(canParticipantEdit("2026-09-03T13:50:00Z", "2026-09-03T14:01:00Z")).toBe(false);
    expect(canParticipantEdit("2026-09-03T13:50:00Z", "2026-09-03T15:00:00Z")).toBe(false);
  });

  it("서버 UTC 시각을 KST 날짜로 바꾼다", () => {
    expect(kstDateKey("2026-09-03T15:01:00Z")).toBe("2026-09-04");
  });
});

describe("일별 상태", () => {
  it("마감 전 제출은 완료다", () => {
    expect(
      evaluateDailyStatus({ ...base, now: "2026-09-03T13:00:00Z", submittedAt: ["2026-09-03T13:00:00Z"] }),
    ).toBe("completed");
  });

  it("23:01 전 미등록은 pending이고 차감하지 않는다", () => {
    expect(
      evaluateDailyStatus({ ...base, now: "2026-09-03T14:00:30Z", submittedAt: [] }),
    ).toBe("pending");
  });

  it("23:01 이후 미등록은 missed다", () => {
    expect(
      evaluateDailyStatus({ ...base, now: "2026-09-03T14:01:00Z", submittedAt: [] }),
    ).toBe("missed");
  });

  it("마감 후 링크는 완료를 복원하지 않는다", () => {
    expect(
      evaluateDailyStatus({ ...base, now: "2026-09-03T14:30:00Z", submittedAt: ["2026-09-03T14:01:00Z"] }),
    ).toBe("missed");
  });

  it("주말, 비대상일, 면제일은 구분한다", () => {
    expect(evaluateDailyStatus({ ...base, dateKey: "2026-09-05", now: "2026-09-05T15:00:00Z", submittedAt: [] })).toBe("excluded");
    expect(evaluateDailyStatus({ ...base, excludedDates: new Set(["2026-09-03"]), now: "2026-09-03T15:00:00Z", submittedAt: [] })).toBe("excluded");
    expect(evaluateDailyStatus({ ...base, exemptionDates: new Set(["2026-09-03"]), now: "2026-09-03T15:00:00Z", submittedAt: [] })).toBe("exempt");
  });

  it("참여 시작일과 하차일 경계를 지킨다", () => {
    expect(evaluateDailyStatus({ ...base, dateKey: "2026-09-14", joinedAt: "2026-09-15", now: "2026-09-16T15:00:00Z", submittedAt: [] })).toBe("not_enrolled");
    expect(evaluateDailyStatus({ ...base, dateKey: "2026-10-20", leftAt: "2026-10-20", now: "2026-10-21T15:00:00Z", submittedAt: [] })).toBe("not_enrolled");
  });
});

describe("스트릭과 정산", () => {
  it("면제와 비대상일은 스트릭을 끊지 않는다", () => {
    expect(calculateStreak(["completed", "excluded", "exempt", "completed"])).toBe(2);
    expect(calculateStreak(["completed", "missed", "completed"])).toBe(1);
  });

  it("최고 연속 달성과 확정 대상일 기준 완료율을 계산한다", () => {
    const statuses = ["completed", "excluded", "completed", "missed", "completed"] as const;
    expect(calculateBestStreak([...statuses])).toBe(2);
    expect(calculateCompletionRate([...statuses])).toBe(75);
    expect(calculateCompletionRate(["pending", "exempt", "excluded"])).toBeNull();
  });

  it("날짜별 차감단가를 소급하지 않는다", () => {
    const rates = [
      { effectiveFrom: "2026-09-01", amount: 2000 },
      { effectiveFrom: "2026-10-15", amount: 3000 },
    ];
    expect(penaltyRateForDate("2026-10-14", rates)).toBe(2000);
    expect(penaltyRateForDate("2026-10-15", rates)).toBe(3000);
    expect(calculatePenalty([
      { date: "2026-10-14", status: "missed" },
      { date: "2026-10-15", status: "missed" },
      { date: "2026-10-16", status: "completed" },
    ], rates)).toBe(5000);
  });
});

describe("URL 중복 기준", () => {
  it("호스트 대소문자, 해시, 끝 슬래시를 정규화한다", () => {
    expect(normalizeUrl(" HTTPS://Example.COM/share/abc/#part ")).toBe("https://example.com/share/abc");
  });

  it("http/https 이외 프로토콜을 거부한다", () => {
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow();
  });
});

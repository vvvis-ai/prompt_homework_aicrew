import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, inserted: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/password-service", () => ({ hashPassword: async () => "test-hash" }));
vi.mock("@/server/supabase", () => ({
  isDemoMode: () => false,
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      let rows = [...(mocks.tables[table] ?? [])];
      const result = () => ({ data: rows, error: null });
      const query = {
        select: () => query, order: () => query,
        eq: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] === value); return query; },
        in: (key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[key])); return query; },
        lte: (key: string, value: string) => { rows = rows.filter((row) => String(row[key]) <= value); return query; },
        gte: (key: string, value: string) => { rows = rows.filter((row) => String(row[key]) >= value); return query; },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        single: async () => ({ data: rows[0] ?? null, error: null }),
        insert: (row: Record<string, unknown>) => {
          mocks.inserted(row);
          const stored = { ...row, id: 999, submitted_at: new Date().toISOString(), is_featured: false };
          mocks.tables[table] = [...(mocks.tables[table] ?? []), stored];
          rows = [stored];
          return query;
        },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  }),
}));

import { getAppData } from "./app-data";
import { POST } from "@/app/api/submissions/route";
import { calculateParticipantStatuses, calculatePenalty } from "@/lib/business";

const request = (participantId: string) => new Request("http://localhost/api/submissions", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ participantId, url: "https://share.gemini.google/example", password: "test-password" }),
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
  mocks.inserted.mockClear();
  mocks.tables = {
    challenges: [
      { id: 1, name: "2기", is_active: true, start_date: "2026-09-01", end_date: "2026-12-31", penalty_start_date: "2026-09-14" },
      { id: 2, name: "1기", is_active: false, start_date: "2026-01-07", end_date: "2026-06-30" },
      { id: 3, name: "3기", is_active: false, start_date: "2027-01-01", end_date: "2027-06-30" },
    ],
    participants: [
      { id: 10, challenge_id: 1, name: "현재멤버", affiliation: "", joined_at: "2026-09-01", left_at: null, is_active: true },
      { id: 11, challenge_id: 1, name: "비활성멤버", affiliation: "", joined_at: "2026-09-01", left_at: null, is_active: false },
      { id: 20, challenge_id: 2, name: "이전멤버", affiliation: "교육지원과", joined_at: "2026-01-07", left_at: "2026-06-30", is_active: false },
      { id: 30, challenge_id: 3, name: "미래멤버", affiliation: "", joined_at: "2027-01-01", left_at: null, is_active: true },
    ],
    submissions: [],
    penalty_rates: [{ challenge_id: 1, effective_from: "2026-09-01", amount: 2000 }],
  };
});
afterEach(() => vi.useRealTimers());

describe("종료 기수 자율 공유", () => {
  it("1기 이름 선택을 유지하고 숙제·차감·미제출 알림 대상에서 제외한다", async () => {
    const data = await getAppData({ participantId: "20" });
    expect(data.participantGroups[1].members[0].selectable).toBe(true);
    expect(data.selectedParticipant).toMatchObject({ id: "20", name: "이전멤버" });
    expect(data).toMatchObject({ sharingOnly: true, penaltyNotice: null, todayStatus: "not_enrolled" });
    expect(data.summary).toMatchObject({ missedDays: 0, completedDays: 0, completionRate: null });
    expect(data.habit.recentMisses).toBe(0);
    expect(data.calendar.every((day) => ["not_enrolled", "future"].includes(day.status))).toBe(true);
  });

  it("1기 명의로 저장하고 양쪽 회원의 피드에 표시하되 2기 집계를 늘리지 않는다", async () => {
    const before = await getAppData({ participantId: "10", date: "all" });
    const response = await POST(request("20"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sharingOnly: true, onTime: false });
    expect(mocks.inserted).toHaveBeenCalledWith(expect.objectContaining({ challenge_id: 2, participant_id: 20 }));
    const alumni = await getAppData({ participantId: "20", date: "all" });
    const active = await getAppData({ participantId: "10", date: "all" });
    expect(alumni.feed[0]).toMatchObject({ participantId: "20", participantName: "이전멤버" });
    expect(active.feed).toEqual(alumni.feed);
    expect(alumni.summary.totalLinks).toBe(1);
    expect(alumni.calendar.find((day) => day.date === "2026-09-15")?.submissions).toHaveLength(1);
    expect(active.crewGrowth).toEqual(before.crewGrowth);
    expect(active.sharingOnly).toBe(false);
    expect(active.todayStatus).toBe("pending");
    expect(active.penaltyNotice?.dailyAmount).toBe(2000);
  });

  it("1기는 23시 마감 후에도 자율 공유가 가능하다", async () => {
    vi.setSystemTime(new Date("2026-09-15T14:30:00Z"));
    expect((await POST(request("20"))).status).toBe(200);
  });

  it.each(["11", "30", "999"])("현재 비활성·미래 기수·없는 회원의 등록은 허용하지 않는다: %s", async (id) => {
    expect((await POST(request(id))).status).toBe(403);
    expect(mocks.inserted).not.toHaveBeenCalled();
  });

  it("2기는 정상 숙제로 등록된다", async () => {
    const response = await POST(request("10"));
    expect(await response.json()).toMatchObject({ sharingOnly: false, onTime: true });
    expect(mocks.inserted).toHaveBeenCalledWith(expect.objectContaining({ challenge_id: 1, participant_id: 10 }));
    expect((await getAppData({ participantId: "10" })).todayStatus).toBe("completed");
  });

  it("종료일 이후 공유 여부로 기존 정산액이나 새 차감액이 생기지 않는다", () => {
    const input = {
      now: new Date(), joinedAt: "2026-01-07", leftAt: null,
      challengeStart: "2026-01-07", challengeEnd: "2026-06-30",
      excludedDates: new Set<string>(), exemptionDates: new Set<string>(), submittedAt: [] as string[],
    };
    const before = calculateParticipantStatuses(input);
    const after = calculateParticipantStatuses({ ...input, submittedAt: [new Date().toISOString()] });
    expect(after).toEqual(before);
    expect(calculatePenalty(after, [{ effectiveFrom: "2026-01-07", amount: 0 }])).toBe(0);
    expect(calculateParticipantStatuses({ ...input, from: "2026-09-01" })).toEqual([]);
  });
});

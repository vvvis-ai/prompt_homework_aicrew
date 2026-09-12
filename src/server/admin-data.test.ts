import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]> }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/admin-session", () => ({ getAdminSession: vi.fn() }));
vi.mock("@/server/supabase", () => ({
  isDemoMode: () => false,
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query, in: () => query, is: () => query, order: () => query, limit: () => query,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: mocks.tables[table] ?? [], error: null }).then(resolve),
      };
      return query;
    },
  }),
}));

import { getAdminData } from "./admin-data";

afterEach(() => vi.useRealTimers());

describe("종료 기수 정산", () => {
  it("1기 벌금 0원과 실제 환급 80,000원을 과거 조회월에도 유지한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
    mocks.tables = {
      challenges: [{ id: 2, name: "1기", start_date: "2026-01-07", end_date: "2026-06-30", penalty_start_date: "2026-01-07", default_fee: 80000, default_penalty: 0, is_active: false }],
      operators: [{ id: 1, name: "테스트", is_active: true }],
      participants: [{ id: 6, name: "참가자", affiliation: "", joined_at: "2026-01-07", left_at: null, paid_amount: 80000, paid_at: "2026-01-07", refunded_amount: 80000, is_active: true }],
      penalty_rates: [{ id: 2, effective_from: "2026-01-07", amount: 0 }],
    };
    const data = await getAdminData("2026-01", "2", { authenticated: true, operatorId: "1", operatorName: "테스트" });
    expect(data.participants[0].missedDays).toBeGreaterThan(0);
    expect(data.participants[0]).toMatchObject({ penaltyAmount: 0, expectedRefund: 80000, refundedAmount: 80000, paymentStatus: "paid", paidAt: "2026-01-07" });
    expect(data.metrics.paidCount).toBe(1);
    expect(data.metrics.unpaidCount).toBe(0);
    expect(data.metrics.monthPenalty).toBe(0);
  });

  it("미정산 2기는 기존 단가로 계산하고 환급 완료로 표시하지 않는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
    mocks.tables = {
      challenges: [{ id: 1, name: "2기", start_date: "2026-09-01", end_date: "2026-12-31", penalty_start_date: "2026-09-01", default_fee: 80000, default_penalty: 2000, is_active: true }],
      operators: [{ id: 1, name: "테스트", is_active: true }],
      participants: [{ id: 10, name: "참가자", affiliation: "", joined_at: "2026-09-01", left_at: null, paid_amount: 80000, paid_at: null, refunded_amount: null, is_active: true }],
      penalty_rates: [{ id: 1, effective_from: "2026-09-01", amount: 2000 }],
    };
    const data = await getAdminData("2026-09", "1", { authenticated: true, operatorId: "1", operatorName: "테스트" });
    expect(data.participants[0]).toMatchObject({ penaltyAmount: 10000, expectedRefund: 70000, refundedAmount: null, paymentStatus: "unconfirmed" });
    expect(data.metrics.paidCount).toBe(0);
    expect(data.metrics.monthPenalty).toBe(10000);
  });

  it("납부액이 0인 참가자는 미납으로 구분하고 차감은 그대로 누적한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
    mocks.tables = {
      challenges: [{ id: 1, name: "2기", start_date: "2026-09-01", end_date: "2026-12-31", penalty_start_date: "2026-09-01", default_fee: 80000, default_penalty: 2000, is_active: true }],
      operators: [{ id: 1, name: "테스트", is_active: true }],
      participants: [{ id: 11, name: "미납자", affiliation: "", joined_at: "2026-09-01", left_at: null, paid_amount: 0, paid_at: null, refunded_amount: null, is_active: true }],
      penalty_rates: [{ id: 1, effective_from: "2026-09-01", amount: 2000 }],
    };
    const data = await getAdminData("2026-09", "1", { authenticated: true, operatorId: "1", operatorName: "테스트" });
    expect(data.participants[0]).toMatchObject({ paymentStatus: "unpaid", paidAmount: 0, penaltyAmount: 10000, expectedRefund: -10000 });
    expect(data.metrics.unpaidCount).toBe(1);
  });

  it("차감 시작일 이전 평일은 미제출로 집계하지 않는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-18T12:00:00Z"));
    mocks.tables = {
      challenges: [{ id: 1, name: "2기", start_date: "2026-09-01", end_date: "2026-12-31", penalty_start_date: "2026-09-14", default_fee: 80000, default_penalty: 2000, is_active: true }],
      operators: [{ id: 1, name: "테스트", is_active: true }],
      participants: [{ id: 12, name: "참가자", affiliation: "", joined_at: "2026-09-01", left_at: null, paid_amount: 80000, paid_at: "2026-09-12", refunded_amount: null, is_active: true }],
      penalty_rates: [{ id: 1, effective_from: "2026-09-01", amount: 2000 }],
    };
    const data = await getAdminData("2026-09", "1", { authenticated: true, operatorId: "1", operatorName: "테스트" });
    expect(data.challenge?.penaltyStartDate).toBe("2026-09-14");
    expect(data.matrix[0].days["2026-09-11"]).toBe("excluded");
    expect(data.matrix[0].days["2026-09-14"]).toBe("missed");
    expect(data.matrix[0].days["2026-09-18"]).toBe("pending");
    expect(data.participants[0].penaltyAmount).toBe(8000);
    expect(data.weeklyPenalty).toMatchObject({ missedCount: 4, amount: 8000, participantCount: 1 });
  });
});

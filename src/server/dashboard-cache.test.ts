import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => ({
  from: () => {
    const q = {
      select: () => q, eq: () => q, update: () => q,
      single: () => mocks.read(), maybeSingle: () => mocks.write(),
    };
    return q;
  },
}) }));
import { dashboardExpiry, dashboardSnapshot } from "./dashboard-cache";

const now = new Date("2026-10-22T12:00:00Z");
const row = { revision: "r1", payload: null, format_version: 1, valid_until: null };
const load = vi.fn(async () => ({ value: { count: 7 }, validUntil: dashboardExpiry(now) }));
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); vi.clearAllMocks();
  mocks.read.mockResolvedValue({ data: { ...row }, error: null });
  mocks.write.mockResolvedValue({ data: { revision: "r1" }, error: null });
});
afterEach(() => vi.useRealTimers());

describe("snapshot consistency and failure recovery", () => {
  it("reuses a matching, unexpired snapshot", async () => {
    mocks.read.mockResolvedValue({ data: { ...row, payload: { count: 4 }, valid_until: dashboardExpiry(now) }, error: null });
    expect((await dashboardSnapshot(load)).value).toEqual({ count: 4 });
    expect(load).not.toHaveBeenCalled();
  });
  it("rebuilds an older snapshot format after deployment", async () => {
    mocks.read.mockResolvedValue({ data: { ...row, format_version: 0, payload: { count: 4 }, valid_until: dashboardExpiry(now) }, error: null });
    expect((await dashboardSnapshot(load)).value).toEqual({ count: 7 });
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("discards a build when a concurrent mutation changes the revision", async () => {
    mocks.write.mockResolvedValueOnce({ data: null, error: null });
    load.mockResolvedValueOnce({ value: { count: 3 }, validUntil: dashboardExpiry(now) });
    expect((await dashboardSnapshot(load)).value).toEqual({ count: 7 });
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("bounds retries under continuous mutations", async () => {
    mocks.write.mockResolvedValue({ data: null, error: null });
    expect((await dashboardSnapshot(load)).value).toEqual({ count: 7 });
    expect(load).toHaveBeenCalledTimes(3);
    expect(mocks.write).toHaveBeenCalledTimes(2);
  });
  it.each(["read", "write"] as const)("keeps the feed working when cache %s fails", async (operation) => {
    mocks[operation].mockRejectedValue(new Error("cache unavailable"));
    expect((await dashboardSnapshot(load)).value).toEqual({ count: 7 });
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("does not mask errors from the source database", async () => {
    await expect(dashboardSnapshot(async () => { throw new Error("source unavailable"); })).rejects.toThrow("source unavailable");
  });
});

describe("time boundaries", () => {
  it.each([
    ["2026-10-22T14:00:59.999Z", "2026-10-22T14:01:00.000Z"],
    ["2026-10-22T14:01:00.000Z", "2026-10-22T15:00:00.000Z"],
    ["2026-10-22T14:59:59.999Z", "2026-10-22T15:00:00.000Z"],
    ["2026-10-22T15:00:00.000Z", "2026-10-23T14:01:00.000Z"],
  ])("expires at the next cutoff or KST midnight: %s", (at, expected) => {
    expect(dashboardExpiry(new Date(at))).toBe(expected);
  });
  it("also expires when a future-dated submission becomes visible", () => {
    expect(dashboardExpiry(now, ["2026-10-22T11:00:00Z", "2026-10-22T12:01:00Z"]))
      .toBe("2026-10-22T12:01:00.000Z");
  });
});

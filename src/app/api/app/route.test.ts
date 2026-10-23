import { beforeEach, describe, expect, it, vi } from "vitest";

const getAppData = vi.hoisted(() => vi.fn());
vi.mock("@/server/app-data", () => ({ getAppData }));

import { GET } from "./route";

beforeEach(() => {
  getAppData.mockReset().mockResolvedValue({ feed: [] });
});

describe("공유피드 조회 조건", () => {
  it("빈 날짜·월·참가자는 기본 조회로 처리한다", async () => {
    const response = await GET(new Request("http://localhost/api/app?date=&month=&participantId="));
    expect(response.status).toBe(200);
    expect(getAppData).toHaveBeenCalledWith({ date: undefined, month: undefined, participantId: undefined, featuredOnly: false });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each(["date=2026-02-30", "date=2026-13-01", "month=2026-00", "month=2026-13", "participantId=invalid"])("유효하지 않은 조건은 DB 조회 전에 거부한다: %s", async (query) => {
    expect((await GET(new Request(`http://localhost/api/app?${query}`))).status).toBe(400);
    expect(getAppData).not.toHaveBeenCalled();
  });

  it("보관함 전체 조회와 검색·우수 필터를 유지한다", async () => {
    const query = new URLSearchParams({ date: "all", participantId: "44", month: "2026-10", search: "보고서", featuredOnly: "true" });
    expect((await GET(new Request(`http://localhost/api/app?${query}`))).status).toBe(200);
    expect(getAppData).toHaveBeenCalledWith({ date: "all", participantId: "44", month: "2026-10", search: "보고서", featuredOnly: true });
  });

  it("검색어 100자까지 허용하고 초과 요청은 거부한다", async () => {
    for (const length of [100, 101]) {
      const query = new URLSearchParams({ search: "가".repeat(length) });
      expect((await GET(new Request(`http://localhost/api/app?${query}`))).status).toBe(length === 100 ? 200 : 400);
    }
  });
});

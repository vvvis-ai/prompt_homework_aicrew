import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAppData } from "./app-refresh";

const fetchMock = vi.fn<typeof fetch>();
const params = new URLSearchParams({ date: "2026-10-22" });
const data = { feed: [], month: "2026-10" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("공유피드 갱신", () => {
  it.each(["network", "server"])("일시적인 %s 오류는 한 번 재시도해서 복구한다", async (kind) => {
    if (kind === "network") fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    else fetchMock.mockResolvedValueOnce(new Response("upstream error", { status: 502 }));
    fetchMock.mockResolvedValueOnce(Response.json(data));
    const result = fetchAppData(params);
    await vi.runAllTimersAsync();
    expect(await result).toEqual(data);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("조회 조건 오류는 재시도하지 않고 구체적으로 안내한다", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "invalid" }, { status: 400 }));
    await expect(fetchAppData(params)).rejects.toThrow("조회 조건을 확인해주세요");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("연속 실패해도 두 번을 초과해서 요청하지 않는다", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const assertion = expect(fetchAppData(params)).rejects.toThrow("연결이 원활하지 않아");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("필터 변경으로 취소하면 재시도 대기도 중단한다", async () => {
    const controller = new AbortController();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const assertion = expect(fetchAppData(params, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("이미 취소된 요청은 전송하지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(fetchAppData(params, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("늦게 도착한 이전 필터의 응답은 적용하지 않는다", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementationOnce(async () => {
      controller.abort();
      return Response.json(data);
    });
    await expect(fetchAppData(params, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

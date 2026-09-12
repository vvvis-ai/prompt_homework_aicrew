import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolvePaidAt } from "./admin-mutations";

describe("납부 확인일 정규화", () => {
  it("납부액이 0이면 확인일을 비운다", () => {
    expect(resolvePaidAt(0, "2026-09-12", "2026-09-12")).toBeNull();
  });

  it("확인일이 없으면 null을 유지한다", () => {
    expect(resolvePaidAt(80000, null, "2026-09-12")).toBeNull();
    expect(resolvePaidAt(80000, undefined, "2026-09-12")).toBeNull();
  });

  it("오늘까지는 허용하고 미래 날짜는 거부한다", () => {
    expect(resolvePaidAt(80000, "2026-09-12", "2026-09-12")).toBe("2026-09-12");
    expect(() => resolvePaidAt(80000, "2026-09-13", "2026-09-12")).toThrow();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("./supabase", () => ({ isDatabaseConfigured: () => true, isDemoMode: () => false }));
const remote = vi.hoisted(() => vi.fn());
vi.mock("./password-service", () => ({ verifyPassword: remote }));
import { verifyAdminPassword } from "./admin-session";
afterEach(() => { vi.unstubAllEnvs(); remote.mockReset(); });

describe("production admin password verification", () => {
  it("sends the configured PBKDF2 hash to the password service without local derivation", async () => {
    vi.stubEnv("ADMIN_PASSWORD_PBKDF2", "configured-pbkdf2");
    vi.stubEnv("ADMIN_PASSWORD_HASH", "configured-bcrypt");
    remote.mockResolvedValue(true);
    expect(await verifyAdminPassword("password")).toBe(true);
    expect(remote).toHaveBeenCalledWith("password", "configured-pbkdf2");
  });
  it("retains legacy bcrypt support and propagates service outages without accepting login", async () => {
    vi.stubEnv("ADMIN_PASSWORD_PBKDF2", "");
    vi.stubEnv("ADMIN_PASSWORD_HASH", "configured-bcrypt");
    remote.mockResolvedValue(false);
    expect(await verifyAdminPassword("wrong")).toBe(false);
    expect(remote).toHaveBeenCalledWith("wrong", "configured-bcrypt");
    remote.mockRejectedValue(new Error("service unavailable"));
    await expect(verifyAdminPassword("password")).rejects.toThrow("service unavailable");
  });
});

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { jwtVerify, importJWK } from "jose";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ app: vi.fn(), from: vi.fn() }));
vi.mock("./app-data", () => ({ getAppData: mocks.app }));
vi.mock("./supabase", () => ({ getSupabaseAdmin: () => ({ from: mocks.from }) }));
import { sendReminders } from "./send-reminders";

const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicJwk = pair.publicKey.export({ format: "jwk" });
function setup(status: string, claim = true) {
  const select = { lte: () => ({ or: () => ({ limit: async () => ({ data: [{ id: "test", participant_id: 1, endpoint: "https://fcm.googleapis.com/fcm/send/test", last_sent_date: null }], error: null }) }) }) };
  mocks.from.mockReturnValue({ select: () => select, update: () => ({ eq: () => ({ or: () => ({ select: async () => ({ data: claim ? [{ id: "test" }] : [], error: null }) }) }) }) });
  mocks.app.mockResolvedValue({ todayStatus: status });
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
  vi.stubEnv("VAPID_PRIVATE_JWK", JSON.stringify(pair.privateKey.export({ format: "jwk" })));
  vi.stubEnv("VAPID_PUBLIC_KEY", "test-public-key");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 201 })));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("scheduled reminders", () => {
  it.each(["completed", "excluded", "exempt", "not_enrolled", "missed"])("does not send for %s", async (status) => {
    setup(status); await sendReminders(); expect(fetch).not.toHaveBeenCalled();
  });
  it("does not send twice when another invocation already claimed the day", async () => {
    setup("pending", false); await sendReminders(); expect(fetch).not.toHaveBeenCalled();
  });
  it("signs VAPID for the push service and sends only when pending", async () => {
    setup("pending"); expect(await sendReminders()).toEqual({ sent: 1, failed: 0 });
    const options = vi.mocked(fetch).mock.calls[0][1];
    const auth = (options?.headers as Record<string, string>).Authorization;
    const token = auth.split("t=")[1].split(",")[0];
    const verified = await jwtVerify(token, await importJWK(publicJwk, "ES256"), { audience: "https://fcm.googleapis.com" });
    expect(verified.payload.sub).toBe("https://prompt-homework-aicrew.antae98.workers.dev");
    expect((options?.headers as Record<string, string>).TTL).toBe("60");
  });
  it("does not send at or after the visible 23:00 deadline", async () => {
    setup("pending"); vi.setSystemTime(new Date("2026-09-08T14:00:00Z")); await sendReminders(); expect(fetch).not.toHaveBeenCalled();
  });
});

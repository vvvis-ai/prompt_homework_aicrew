import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { importJWK, jwtVerify } from "jose";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ app: vi.fn(), from: vi.fn() }));
vi.mock("./app-data", () => ({ getAppData: mocks.app }));
vi.mock("./supabase", () => ({ getSupabaseAdmin: () => ({ from: mocks.from }) }));
import { sendReminders, sendTestReminders } from "./send-reminders";

const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicJwk = pair.publicKey.export({ format: "jwk" });
const reminder = {
  id: "test",
  participant_id: 1,
  endpoint: "https://fcm.googleapis.com/fcm/send/test",
  last_sent_date: null,
  last_attempt_at: null,
  consecutive_failures: 0,
};

type SetupOptions = {
  status?: string;
  claim?: boolean;
  rows?: typeof reminder[];
};

function setup({ status = "pending", claim = true, rows = [reminder] }: SetupOptions = {}) {
  const updates: Array<Record<string, unknown>> = [];
  mocks.from.mockImplementation(() => {
    let updateValues: Record<string, unknown> | null = null;
    let selectedColumns = "";
    const query = {
      select(columns: string) { selectedColumns = columns; return query; },
      update(values: Record<string, unknown>) { updateValues = values; updates.push(values); return query; },
      eq() { return query; },
      is() { return query; },
      lt() { return query; },
      lte() { return query; },
      or() { return query; },
      limit() { return query; },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        let value: unknown;
        if (updateValues && selectedColumns === "id") {
          value = { data: claim ? [{ id: reminder.id }] : [], error: null };
        } else if (updateValues) {
          value = { data: null, error: null };
        } else {
          value = { data: rows, error: null };
        }
        return Promise.resolve(value).then(resolve, reject);
      },
    };
    return query;
  });
  mocks.app.mockResolvedValue({ todayStatus: status });
  return { updates };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
  vi.stubEnv("VAPID_PRIVATE_JWK", JSON.stringify(pair.privateKey.export({ format: "jwk" })));
  vi.stubEnv("VAPID_PUBLIC_KEY", "test-public-key");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 201 })));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("scheduled reminders", () => {
  it.each(["completed", "excluded", "exempt", "not_enrolled", "missed"])("does not send for %s", async (status) => {
    setup({ status });
    await sendReminders();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not send when another invocation owns the active claim", async () => {
    setup({ claim: false });
    await sendReminders();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("marks the date only after the push service accepts the notification", async () => {
    const { updates } = setup();
    expect(await sendReminders()).toEqual({ sent: 1, failed: 0, expired: 0 });

    const options = vi.mocked(fetch).mock.calls[0][1];
    const headers = options?.headers as Record<string, string>;
    const token = headers.Authorization.split("t=")[1].split(",")[0];
    const verified = await jwtVerify(token, await importJWK(publicJwk, "ES256"), {
      audience: "https://fcm.googleapis.com",
    });
    expect(verified.payload.sub).toBe("https://prompt-homework-aicrew.antae98.workers.dev");
    expect(headers.TTL).toBe("3600");
    expect(options?.redirect).toBe("manual");
    expect(updates).toContainEqual(expect.objectContaining({
      last_delivery_status: "sent",
      last_sent_date: "2026-09-08",
      consecutive_failures: 0,
    }));
  });

  it("keeps the date unsent after a temporary push service failure so the next cron can retry", async () => {
    const { updates } = setup();
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));

    expect(await sendReminders()).toEqual({ sent: 0, failed: 1, expired: 0 });
    const failed = updates.find((value) => value.last_delivery_status === "failed");
    expect(failed).toEqual(expect.objectContaining({
      last_response_status: 503,
      consecutive_failures: 1,
    }));
    expect(failed).not.toHaveProperty("last_sent_date");
  });

  it("disables an expired subscription reported by the push service", async () => {
    const { updates } = setup();
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 410 }));

    expect(await sendReminders()).toEqual({ sent: 0, failed: 0, expired: 1 });
    expect(updates).toContainEqual(expect.objectContaining({
      last_delivery_status: "expired",
      last_response_status: 410,
      disabled_at: expect.any(String),
    }));
  });

  it("does not send at or after the visible 23:00 deadline", async () => {
    setup();
    vi.setSystemTime(new Date("2026-09-08T14:00:00Z"));
    await sendReminders();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("test reminders", () => {
  it("records a successful test without consuming today's scheduled reminder", async () => {
    const { updates } = setup();
    expect(await sendTestReminders(1)).toEqual({ sent: 1, failed: 0, expired: 0 });
    const successfulTest = updates.find((value) => value.last_delivery_status === "test_sent");
    expect(successfulTest).toEqual(expect.objectContaining({ consecutive_failures: 0 }));
    expect(successfulTest).not.toHaveProperty("last_sent_date");
  });
});

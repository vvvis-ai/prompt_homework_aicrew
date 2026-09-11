import "server-only";
import { importJWK, SignJWT } from "jose";
import { getSupabaseAdmin } from "./supabase";
import { getAppData } from "./app-data";
import { kstDateKey, formatKstTime } from "@/lib/time";
import { isPushEndpoint } from "@/lib/habits";

const PUSH_TTL_SECONDS = 60 * 60;
const MAX_CONSECUTIVE_FAILURES = 5;
const CLAIM_TIMEOUT_MS = 45_000;

type PushResponse = { ok: boolean; status: number };

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown push delivery error";
  return message.slice(0, 500);
}

async function sendWebPush(endpoint: string): Promise<PushResponse> {
  if (!process.env.VAPID_PRIVATE_JWK || !process.env.VAPID_PUBLIC_KEY) {
    throw new Error("Push keys not configured");
  }
  if (!isPushEndpoint(endpoint)) throw new Error("Invalid push endpoint");
  const key = await importJWK(JSON.parse(process.env.VAPID_PRIVATE_JWK), "ES256");
  const jwt = await new SignJWT({ sub: "https://prompt-homework-aicrew.antae98.workers.dev" })
    .setProtectedHeader({ alg: "ES256" })
    .setAudience(new URL(endpoint).origin)
    .setExpirationTime("1h")
    .sign(key);
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
    headers: {
      Authorization: `vapid t=${jwt}, k=${process.env.VAPID_PUBLIC_KEY}`,
      TTL: String(PUSH_TTL_SECONDS),
      Urgency: "normal",
      "Content-Length": "0",
    },
  });
  return { ok: response.ok, status: response.status };
}

async function updateAttempt(
  reminderId: string,
  values: {
    last_attempt_at?: string;
    last_delivery_status: "sending" | "sent" | "failed" | "expired" | "test_sent";
    last_response_status: number | null;
    last_error: string | null;
    consecutive_failures: number;
    last_sent_date?: string;
    disabled_at?: string;
  },
) {
  const { error } = await getSupabaseAdmin().from("push_reminders").update(values).eq("id", reminderId);
  if (error) throw error;
}

async function deliverClaimedReminder(
  row: { id: string; endpoint: string; consecutive_failures: number },
  options: { today?: string; test?: boolean } = {},
) {
  try {
    const response = await sendWebPush(row.endpoint);
    if (response.status === 404 || response.status === 410) {
      await updateAttempt(row.id, {
        last_delivery_status: "expired",
        last_response_status: response.status,
        last_error: "Push subscription expired",
        consecutive_failures: row.consecutive_failures + 1,
        disabled_at: new Date().toISOString(),
      });
      return { status: "expired" as const, responseStatus: response.status };
    }
    if (!response.ok) throw new Error(`Push service ${response.status}`);
    await updateAttempt(row.id, {
      last_delivery_status: options.test ? "test_sent" : "sent",
      last_response_status: response.status,
      last_error: null,
      consecutive_failures: 0,
      ...(options.today ? { last_sent_date: options.today } : {}),
    });
    return { status: "sent" as const, responseStatus: response.status };
  } catch (error) {
    const message = errorMessage(error);
    const responseStatus = /^Push service (\d{3})$/.exec(message)?.[1];
    try {
      await updateAttempt(row.id, {
        last_delivery_status: "failed",
        last_response_status: responseStatus ? Number(responseStatus) : null,
        last_error: message,
        consecutive_failures: row.consecutive_failures + 1,
      });
    } catch (trackingError) {
      console.error("push-delivery-tracking-failed", { reminderId: row.id, error: errorMessage(trackingError) });
    }
    console.error("push-delivery-failed", { reminderId: row.id, status: responseStatus ?? null, error: message });
    return { status: "failed" as const, responseStatus: responseStatus ? Number(responseStatus) : null, error: message };
  }
}

export async function sendReminders() {
  const now = new Date();
  const today = kstDateKey(now);
  const time = formatKstTime(now.toISOString());
  if (time < "08:00" || time >= "23:00") return { sent: 0, failed: 0, expired: 0 };
  const db = getSupabaseAdmin();
  const { data: rows, error } = await db
    .from("push_reminders")
    .select("id,participant_id,endpoint,last_sent_date,last_attempt_at,consecutive_failures")
    .is("disabled_at", null)
    .lt("consecutive_failures", MAX_CONSECUTIVE_FAILURES)
    .lte("reminder_time", time)
    .or(`last_sent_date.is.null,last_sent_date.lt.${today}`)
    .limit(500);
  if (error) throw error;

  let sent = 0;
  let failed = 0;
  let expired = 0;
  const claimCutoff = new Date(now.getTime() - CLAIM_TIMEOUT_MS).toISOString();
  for (let offset = 0; offset < (rows?.length ?? 0); offset += 5) {
    await Promise.all((rows ?? []).slice(offset, offset + 5).map(async (row) => {
      try {
        const app = await getAppData({ participantId: String(row.participant_id) });
        if (app.todayStatus !== "pending" || !isPushEndpoint(row.endpoint)) return;
        const attemptedAt = new Date().toISOString();
        const claim = await db
          .from("push_reminders")
          .update({
            last_attempt_at: attemptedAt,
            last_delivery_status: "sending",
            last_response_status: null,
            last_error: null,
          })
          .eq("id", row.id)
          .or(`last_sent_date.is.null,last_sent_date.lt.${today}`)
          .or(`last_attempt_at.is.null,last_attempt_at.lt.${claimCutoff}`)
          .select("id");
        if (claim.error) throw claim.error;
        if (!claim.data?.length) return;
        const result = await deliverClaimedReminder(row, { today });
        if (result.status === "sent") sent += 1;
        else if (result.status === "expired") expired += 1;
        else failed += 1;
      } catch (error) {
        failed += 1;
        console.error("push-reminder-processing-failed", { reminderId: row.id, error: errorMessage(error) });
      }
    }));
  }
  return { sent, failed, expired };
}

export async function sendTestReminders(participantId: number) {
  const db = getSupabaseAdmin();
  const { data: rows, error } = await db
    .from("push_reminders")
    .select("id,endpoint,consecutive_failures")
    .eq("participant_id", participantId)
    .is("disabled_at", null);
  if (error) throw error;
  if (!rows?.length) throw new Error("이 참가자에게 등록된 알림 기기가 없습니다.");

  const results = await Promise.all(rows.map(async (row) => {
    await updateAttempt(row.id, {
      last_attempt_at: new Date().toISOString(),
      last_delivery_status: "sending",
      last_response_status: null,
      last_error: null,
      consecutive_failures: row.consecutive_failures,
    });
    return deliverClaimedReminder(row, { test: true });
  }));
  return {
    sent: results.filter((result) => result.status === "sent").length,
    failed: results.filter((result) => result.status === "failed").length,
    expired: results.filter((result) => result.status === "expired").length,
  };
}

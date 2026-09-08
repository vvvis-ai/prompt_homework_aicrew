import "server-only";
import { importJWK, SignJWT } from "jose";
import { getSupabaseAdmin } from "./supabase";
import { getAppData } from "./app-data";
import { kstDateKey, formatKstTime } from "@/lib/time";
import { isPushEndpoint } from "@/lib/habits";

export async function sendReminders() {
  if (!process.env.VAPID_PRIVATE_JWK || !process.env.VAPID_PUBLIC_KEY) throw new Error("Push keys not configured");
  const now = new Date();
  const today = kstDateKey(now);
  const time = formatKstTime(now.toISOString());
  if (time < "08:00" || time >= "23:00") return { sent: 0 };
  const db = getSupabaseAdmin();
  const { data: rows, error } = await db.from("push_reminders").select("id,participant_id,endpoint,last_sent_date").lte("reminder_time", time).or(`last_sent_date.is.null,last_sent_date.lt.${today}`).limit(500);
  if (error) throw error;
  const key = await importJWK(JSON.parse(process.env.VAPID_PRIVATE_JWK), "ES256");
  let sent = 0;
  let failed = 0;
  for (let offset = 0; offset < (rows?.length ?? 0); offset += 5) {
    await Promise.all((rows ?? []).slice(offset, offset + 5).map(async (row) => {
      try {
        // Fresh server status immediately before dispatch; inactive cohorts are excluded.
        const app = await getAppData({ participantId: String(row.participant_id) });
        if (app.todayStatus !== "pending" || !isPushEndpoint(row.endpoint)) return;
        const claim = await db.from("push_reminders").update({ last_sent_date: today }).eq("id", row.id).or(`last_sent_date.is.null,last_sent_date.lt.${today}`).select("id");
        if (claim.error) throw claim.error;
        if (!claim.data?.length) return;
        const jwt = await new SignJWT({ sub: "https://prompt-homework-aicrew.antae98.workers.dev" }).setProtectedHeader({ alg: "ES256" }).setAudience(new URL(row.endpoint).origin).setExpirationTime("1h").sign(key);
        const response = await fetch(row.endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(8000), headers: { Authorization: `vapid t=${jwt}, k=${process.env.VAPID_PUBLIC_KEY}`, TTL: "60", Urgency: "normal", "Content-Length": "0" } });
        if (response.status === 404 || response.status === 410) {
          const removed = await db.from("push_reminders").delete().eq("id", row.id);
          if (removed.error) throw removed.error;
        } else if (!response.ok) {
          throw new Error(`Push service ${response.status}`);
        } else { sent += 1; }
      } catch {
        failed += 1;
        // Keep the daily claim on ambiguous delivery failures to avoid duplicate notifications.
      }
    }));
  }
  return { sent, failed };
}

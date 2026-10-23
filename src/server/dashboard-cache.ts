import "server-only";
import { kstDateKey, kstDateRange } from "@/lib/time";
import type { Json } from "@/server/database.types";
import { getSupabaseAdmin } from "@/server/supabase";

// Bump when the stored snapshot's shape or calculation rules change.
const FORMAT_VERSION = 1;

export function dashboardExpiry(now: Date, futureSubmissionTimes: string[] = []): string {
  const today = kstDateKey(now);
  const cutoff = new Date(`${today}T23:01:00+09:00`).getTime();
  let expiry = cutoff > now.getTime() ? cutoff : Date.parse(kstDateRange(today).end);
  for (const time of futureSubmissionTimes) {
    const timestamp = Date.parse(time);
    if (timestamp > now.getTime() && timestamp < expiry) expiry = timestamp;
  }
  return new Date(expiry).toISOString();
}

type Loaded<T> = { value: T; validUntil: string };

/** One database snapshot is shared by all Workers and all query filters.
 * A trigger changes the revision in the same transaction as every source edit.
 * Compare-and-swap prevents an in-flight rebuild from publishing stale data.
 */
export async function dashboardSnapshot<T>(load: (now: Date) => Promise<Loaded<T>>) {
  const db = getSupabaseAdmin();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let cached;
    try {
      const result = await db.from("dashboard_snapshot")
        .select("revision,payload,valid_until,format_version").eq("id", true).single();
      if (result.error) throw result.error;
      cached = result.data;
    } catch {
      // A cache outage or a rolling schema deployment must not take the feed down.
      console.warn("dashboard cache read unavailable; using fresh data");
      break;
    }
    const now = new Date();
    if (cached?.payload && cached.format_version === FORMAT_VERSION &&
      cached.valid_until && Date.parse(cached.valid_until) > now.getTime()) {
      console.info("dashboard snapshot hit");
      return { value: cached.payload as unknown as T, now };
    }
    const loaded = await load(now);
    if (Date.parse(loaded.validUntil) <= Date.now()) continue;
    try {
      const result = await db.from("dashboard_snapshot").update({
        payload: loaded.value as unknown as Json,
        format_version: FORMAT_VERSION,
        valid_until: loaded.validUntil,
        built_at: now.toISOString(),
      }).eq("id", true).eq("revision", cached.revision).select("revision").maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) continue; // A source changed while we were reading it.
      console.info("dashboard snapshot rebuilt");
    } catch {
      console.warn("dashboard cache write unavailable; using fresh data");
    }
    return { value: loaded.value, now };
  }
  // Bound retries under continuous writes. Never persist this fallback.
  const now = new Date();
  return { value: (await load(now)).value, now };
}

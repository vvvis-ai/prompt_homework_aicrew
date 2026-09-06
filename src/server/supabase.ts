import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/server/database.types";

let client: ReturnType<typeof createClient<Database>> | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export function isDemoMode(): boolean {
  return (
    String(process.env.DEMO_MODE) === "true" ||
    (process.env.NODE_ENV !== "production" && !isDatabaseConfigured())
  );
}

export function getSupabaseAdmin() {
  if (!isDatabaseConfigured()) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }
  if (!client) {
    client = createClient<Database>(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SECRET_KEY as string,
      {
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );
  }
  return client;
}

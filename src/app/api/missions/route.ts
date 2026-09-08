import { getSupabaseAdmin, isDemoMode } from "@/server/supabase";
import { starterMission } from "@/lib/habits";
import { kstDateKey } from "@/lib/time";

export async function GET() {
  const today = kstDateKey(new Date());
  if (isDemoMode()) return Response.json(starterMission(today));
  try {
    const db = getSupabaseAdmin();
    const { data: challenge, error } = await db.from("challenges").select("id").eq("is_active", true).maybeSingle();
    if (error) throw error;
    const result = challenge ? await db.from("daily_missions").select("id,mission_date,title,prompt").eq("challenge_id", challenge.id).eq("mission_date", today).maybeSingle() : null;
    if (result?.error) throw result.error;
    const mission = result?.data;
    return Response.json(mission ? { id: String(mission.id), date: mission.mission_date, title: mission.title, prompt: mission.prompt } : starterMission(today), { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "미션을 불러오지 못했습니다." }, { status: 500 }); }
}

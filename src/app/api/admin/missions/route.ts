import { z } from "zod";
import { adminContext, apiError, demoMutation, writeAudit } from "@/server/admin-mutations";
import { requireOperator } from "@/server/admin-session";
import { isDemoMode } from "@/server/supabase";

const schema = z.object({ challengeId: z.coerce.number().int().positive(), date: z.iso.date(), title: z.string().trim().min(1).max(120), prompt: z.string().trim().min(1).max(3000) });
export async function GET(request: Request) {
  try {
    await requireOperator();
    if (isDemoMode()) return Response.json([]);
    const ctx = await adminContext();
    const id = z.coerce.number().int().positive().parse(new URL(request.url).searchParams.get("challengeId"));
    const { data, error } = await ctx.db.from("daily_missions").select("id,mission_date,title,prompt").eq("challenge_id", id).order("mission_date", { ascending: false });
    if (error) throw error;
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    await requireOperator();
    const body = schema.parse(await request.json());
    if (isDemoMode()) return demoMutation();
    const ctx = await adminContext();
    const { data: challenge, error: ce } = await ctx.db.from("challenges").select("start_date,end_date").eq("id", body.challengeId).single();
    if (ce) throw ce;
    if (body.date < challenge.start_date || body.date > challenge.end_date) throw new Error("기수 운영 기간 안의 날짜를 선택해주세요.");
    // Unique dates intentionally reject accidental overwrites of a scheduled mission.
    const { data, error } = await ctx.db.from("daily_missions").insert({ challenge_id: body.challengeId, mission_date: body.date, title: body.title, prompt: body.prompt, operator_id: ctx.operatorId }).select("id,title,mission_date").single();
    if (error) throw new Error(error.code === "23505" ? "이미 미션이 있는 날짜입니다. 기존 미션을 삭제한 뒤 등록해주세요." : "미션을 저장하지 못했습니다.");
    await writeAudit({ challengeId: body.challengeId, operatorId: ctx.operatorId, action: "create", entityType: "daily_mission", entityId: data.id, after: data });
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request) {
  try {
    await requireOperator();
    const body = z.object({ id: z.coerce.number().int().positive(), challengeId: z.coerce.number().int().positive() }).parse(await request.json());
    if (isDemoMode()) return demoMutation();
    const ctx = await adminContext();
    const { data, error } = await ctx.db.from("daily_missions").delete().eq("id", body.id).eq("challenge_id", body.challengeId).select("id,title,mission_date").single();
    if (error) throw error;
    await writeAudit({ challengeId: body.challengeId, operatorId: ctx.operatorId, action: "delete", entityType: "daily_mission", entityId: data.id, before: data });
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}

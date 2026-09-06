import { adminContext, apiError, demoMutation, writeAudit } from "@/server/admin-mutations";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await adminContext();
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("잘못된 기수입니다.");
    if (ctx.demo) return demoMutation();
    const { data: before, error: readError } = await ctx.db.from("challenges").select("id,name,is_active").eq("id", id).single();
    if (readError) throw readError;
    const { error } = await ctx.db.rpc("activate_challenge", { p_challenge_id: id });
    if (error) throw error;
    await writeAudit({ challengeId: id, operatorId: ctx.operatorId, action: "activate", entityType: "challenge", entityId: id, before, after: { ...before, is_active: true } });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

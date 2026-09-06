import { z } from "zod";
import { adminContext, apiError, demoMutation, requireDeleteConfirmation, writeAudit } from "@/server/admin-mutations";

const schema = z.object({ challengeId: z.coerce.number().int().positive(), confirm: z.literal("DELETE") });

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await adminContext();
    const id = Number((await context.params).id);
    const body = schema.parse(await request.json());
    requireDeleteConfirmation(body.confirm);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("잘못된 면제 기록입니다.");
    if (ctx.demo) return demoMutation();
    const { data: before, error: readError } = await ctx.db.from("exemptions").select("id,challenge_id,participant_id,exemption_date,reason").eq("id", id).eq("challenge_id", body.challengeId).single();
    if (readError) throw readError;
    const { error } = await ctx.db.from("exemptions").delete().eq("id", id).eq("challenge_id", body.challengeId);
    if (error) throw error;
    await writeAudit({ challengeId: body.challengeId, operatorId: ctx.operatorId, action: "delete", entityType: "exemption", entityId: id, before });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

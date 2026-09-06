import { z } from "zod";
import { adminContext, apiError, demoMutation, requireDeleteConfirmation, writeAudit } from "@/server/admin-mutations";

const patchSchema = z.object({
  challengeId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(5000),
  isPinned: z.boolean(),
});
const deleteSchema = z.object({ challengeId: z.coerce.number().int().positive(), confirm: z.literal("DELETE") });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await adminContext();
    const id = Number((await context.params).id);
    const body = patchSchema.parse(await request.json());
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("잘못된 공지입니다.");
    if (ctx.demo) return demoMutation();
    const { data: before, error: readError } = await ctx.db.from("notices").select("id,challenge_id,title,content,is_pinned").eq("id", id).eq("challenge_id", body.challengeId).single();
    if (readError) throw readError;
    const { data: after, error } = await ctx.db.from("notices").update({ title: body.title, content: body.content, is_pinned: body.isPinned }).eq("id", id).eq("challenge_id", body.challengeId).select("id,challenge_id,title,content,is_pinned").single();
    if (error) throw error;
    await writeAudit({ challengeId: body.challengeId, operatorId: ctx.operatorId, action: "update", entityType: "notice", entityId: id, before, after });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await adminContext();
    const id = Number((await context.params).id);
    const body = deleteSchema.parse(await request.json());
    requireDeleteConfirmation(body.confirm);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("잘못된 공지입니다.");
    if (ctx.demo) return demoMutation();
    const { data: before, error: readError } = await ctx.db.from("notices").select("id,challenge_id,title,content,is_pinned").eq("id", id).eq("challenge_id", body.challengeId).single();
    if (readError) throw readError;
    const { error } = await ctx.db.from("notices").delete().eq("id", id).eq("challenge_id", body.challengeId);
    if (error) throw error;
    await writeAudit({ challengeId: body.challengeId, operatorId: ctx.operatorId, action: "delete", entityType: "notice", entityId: id, before });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

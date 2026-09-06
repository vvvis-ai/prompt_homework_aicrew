import { z } from "zod";
import { normalizeUrl } from "@/lib/url";
import { adminContext, apiError, demoMutation, requireDeleteConfirmation, writeAudit } from "@/server/admin-mutations";

const patchSchema = z.object({
  challengeId: z.coerce.number().int().positive(),
  title: z.string().trim().max(120).nullable(),
  url: z.url().max(2048),
  description: z.string().trim().max(1000).nullable(),
});
const deleteSchema = z.object({ challengeId: z.coerce.number().int().positive(), confirm: z.literal("DELETE") });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await adminContext();
    const id = Number((await context.params).id);
    const body = patchSchema.parse(await request.json());
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("잘못된 제출물입니다.");
    if (ctx.demo) return demoMutation();
    const { data: before, error: readError } = await ctx.db.from("submissions").select("id,challenge_id,participant_id,title,url,normalized_url,description,is_featured,submitted_at").eq("id", id).eq("challenge_id", body.challengeId).single();
    if (readError) throw readError;
    const { data: after, error } = await ctx.db.from("submissions").update({
      title: body.title || null,
      url: body.url,
      normalized_url: normalizeUrl(body.url),
      description: body.description || null,
    }).eq("id", id).eq("challenge_id", body.challengeId).select("id,challenge_id,participant_id,title,url,normalized_url,description,is_featured,submitted_at").single();
    if (error) throw error;
    await writeAudit({ challengeId: body.challengeId, operatorId: ctx.operatorId, action: "update", entityType: "submission", entityId: id, before, after });
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
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("잘못된 제출물입니다.");
    if (ctx.demo) return demoMutation();
    const { data: before, error: readError } = await ctx.db.from("submissions").select("id,challenge_id,participant_id,title,url,description,is_featured,submitted_at").eq("id", id).eq("challenge_id", body.challengeId).single();
    if (readError) throw readError;
    const { error } = await ctx.db.from("submissions").delete().eq("id", id).eq("challenge_id", body.challengeId);
    if (error) throw error;
    await writeAudit({ challengeId: body.challengeId, operatorId: ctx.operatorId, action: "delete", entityType: "submission", entityId: id, before });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

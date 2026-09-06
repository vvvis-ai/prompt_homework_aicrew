import { z } from "zod";
import { adminContext, apiError, demoMutation, writeAudit } from "@/server/admin-mutations";

const schema = z.object({ challengeId: z.coerce.number().int().positive(), isFeatured: z.boolean() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await adminContext();
    const id = Number((await context.params).id);
    const body = schema.parse(await request.json());
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("잘못된 제출물입니다.");
    if (ctx.demo) return demoMutation();
    const { data: before, error: readError } = await ctx.db.from("submissions").select("id,challenge_id,is_featured").eq("id", id).eq("challenge_id", body.challengeId).single();
    if (readError) throw readError;
    const { data: after, error } = await ctx.db.from("submissions").update({ is_featured: body.isFeatured }).eq("id", id).eq("challenge_id", body.challengeId).select("id,challenge_id,is_featured").single();
    if (error) throw error;
    await writeAudit({ challengeId: body.challengeId, operatorId: ctx.operatorId, action: body.isFeatured ? "feature" : "unfeature", entityType: "submission", entityId: id, before, after });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

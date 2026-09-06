import { z } from "zod";
import { adminContext, apiError, demoMutation, writeAudit } from "@/server/admin-mutations";

const schema = z.object({
  challengeId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(5000),
  isPinned: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    const ctx = await adminContext();
    const body = schema.parse(await request.json());
    if (ctx.demo) return demoMutation();
    const { data, error } = await ctx.db.from("notices").insert({
      challenge_id: body.challengeId,
      title: body.title,
      content: body.content,
      is_pinned: body.isPinned,
      operator_id: ctx.operatorId,
    }).select("id,title,content,is_pinned,created_at").single();
    if (error) throw error;
    await writeAudit({ challengeId: body.challengeId, operatorId: ctx.operatorId, action: "create", entityType: "notice", entityId: data.id, after: data });
    return Response.json({ ok: true, id: String(data.id) });
  } catch (error) {
    return apiError(error);
  }
}

import { z } from "zod";
import { adminContext, apiError, demoMutation, writeAudit } from "@/server/admin-mutations";

const schema = z.object({
  challengeId: z.coerce.number().int().positive(),
  date: z.iso.date(),
  reason: z.string().trim().min(1).max(500),
});

export async function POST(request: Request) {
  try {
    const ctx = await adminContext();
    const body = schema.parse(await request.json());
    if (ctx.demo) return demoMutation();
    const { data, error } = await ctx.db.from("excluded_dates").insert({
      challenge_id: body.challengeId,
      excluded_date: body.date,
      reason: body.reason,
      source: "admin",
      operator_id: ctx.operatorId,
    }).select("id,excluded_date,reason,source").single();
    if (error) throw error;
    await writeAudit({ challengeId: body.challengeId, operatorId: ctx.operatorId, action: "create", entityType: "excluded_date", entityId: data.id, after: data });
    return Response.json({ ok: true, id: String(data.id) });
  } catch (error) {
    return apiError(error);
  }
}

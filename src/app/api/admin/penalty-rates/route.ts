import { z } from "zod";
import { adminContext, apiError, demoMutation, writeAudit } from "@/server/admin-mutations";

const schema = z.object({
  challengeId: z.coerce.number().int().positive(),
  amount: z.number().int().nonnegative(),
  effectiveFrom: z.iso.date(),
});

export async function POST(request: Request) {
  try {
    const ctx = await adminContext();
    const body = schema.parse(await request.json());
    if (ctx.demo) return demoMutation();
    const { data, error } = await ctx.db.from("penalty_rates").insert({
      challenge_id: body.challengeId,
      amount: body.amount,
      effective_from: body.effectiveFrom,
      operator_id: ctx.operatorId,
    }).select("id,amount,effective_from").single();
    if (error) throw error;
    await writeAudit({ challengeId: body.challengeId, operatorId: ctx.operatorId, action: "create", entityType: "penalty_rate", entityId: data.id, after: data });
    return Response.json({ ok: true, id: String(data.id) });
  } catch (error) {
    return apiError(error);
  }
}

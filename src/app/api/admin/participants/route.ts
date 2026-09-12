import { z } from "zod";
import { adminContext, apiError, demoMutation, resolvePaidAt, writeAudit } from "@/server/admin-mutations";
import { kstDateKey } from "@/lib/time";

const schema = z.object({
  challengeId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(60),
  affiliation: z.string().trim().max(120).optional().default(""),
  joinedAt: z.iso.date(),
  leftAt: z.iso.date().nullable().optional(),
  paidAmount: z.number().int().nonnegative(),
  paidAt: z.iso.date().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await adminContext();
    const body = schema.parse(await request.json());
    if (body.leftAt && body.leftAt < body.joinedAt) throw new Error("퇴장일은 참여일보다 빠를 수 없습니다.");
    const paidAt = resolvePaidAt(body.paidAmount, body.paidAt, kstDateKey());
    if (ctx.demo) return demoMutation();
    const { data, error } = await ctx.db.from("participants").insert({
      challenge_id: body.challengeId,
      name: body.name,
      affiliation: body.affiliation,
      joined_at: body.joinedAt,
      left_at: body.leftAt ?? null,
      paid_amount: body.paidAmount,
      paid_at: paidAt,
    }).select("id,challenge_id,name,affiliation,joined_at,left_at,paid_amount,paid_at,is_active").single();
    if (error) throw error;
    await writeAudit({ challengeId: body.challengeId, operatorId: ctx.operatorId, action: "create", entityType: "participant", entityId: data.id, after: data });
    return Response.json({ ok: true, id: String(data.id) });
  } catch (error) {
    return apiError(error);
  }
}

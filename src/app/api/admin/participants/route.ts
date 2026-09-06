import { z } from "zod";
import { adminContext, apiError, demoMutation, writeAudit } from "@/server/admin-mutations";

const schema = z.object({
  challengeId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(60),
  joinedAt: z.iso.date(),
  leftAt: z.iso.date().nullable().optional(),
  paidAmount: z.number().int().nonnegative(),
});

export async function POST(request: Request) {
  try {
    const ctx = await adminContext();
    const body = schema.parse(await request.json());
    if (body.leftAt && body.leftAt < body.joinedAt) throw new Error("퇴장일은 참여일보다 빠를 수 없습니다.");
    if (ctx.demo) return demoMutation();
    const { data, error } = await ctx.db.from("participants").insert({
      challenge_id: body.challengeId,
      name: body.name,
      joined_at: body.joinedAt,
      left_at: body.leftAt ?? null,
      paid_amount: body.paidAmount,
    }).select("id,challenge_id,name,joined_at,left_at,paid_amount,is_active").single();
    if (error) throw error;
    await writeAudit({ challengeId: body.challengeId, operatorId: ctx.operatorId, action: "create", entityType: "participant", entityId: data.id, after: data });
    return Response.json({ ok: true, id: String(data.id) });
  } catch (error) {
    return apiError(error);
  }
}

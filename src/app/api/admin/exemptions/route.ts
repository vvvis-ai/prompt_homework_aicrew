import { z } from "zod";
import { adminContext, apiError, demoMutation, writeAudit } from "@/server/admin-mutations";

const schema = z.object({
  challengeId: z.coerce.number().int().positive(),
  participantId: z.coerce.number().int().positive(),
  date: z.iso.date(),
  reason: z.string().trim().min(1).max(500),
});

export async function POST(request: Request) {
  try {
    const ctx = await adminContext();
    const body = schema.parse(await request.json());
    if (ctx.demo) return demoMutation();
    const { data: participant, error: participantError } = await ctx.db.from("participants").select("id").eq("id", body.participantId).eq("challenge_id", body.challengeId).single();
    if (participantError || !participant) throw new Error("해당 기수의 참가자가 아닙니다.");
    const { data, error } = await ctx.db.from("exemptions").insert({
      challenge_id: body.challengeId,
      participant_id: body.participantId,
      exemption_date: body.date,
      reason: body.reason,
      operator_id: ctx.operatorId,
    }).select("id,participant_id,exemption_date,reason").single();
    if (error) throw error;
    await writeAudit({ challengeId: body.challengeId, operatorId: ctx.operatorId, action: "create", entityType: "exemption", entityId: data.id, after: data });
    return Response.json({ ok: true, id: String(data.id) });
  } catch (error) {
    return apiError(error);
  }
}

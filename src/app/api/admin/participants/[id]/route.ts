import { z } from "zod";
import { adminContext, apiError, demoMutation, requireDeleteConfirmation, resolvePaidAt, writeAudit } from "@/server/admin-mutations";
import { kstDateKey } from "@/lib/time";

const schema = z.object({
  challengeId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(60),
  affiliation: z.string().trim().max(120).optional(),
  joinedAt: z.iso.date(),
  leftAt: z.iso.date().nullable().optional(),
  paidAmount: z.number().int().nonnegative(),
  paidAt: z.iso.date().nullable().optional(),
  isActive: z.boolean(),
});

const deleteSchema = z.object({
  challengeId: z.coerce.number().int().positive(),
  confirm: z.string(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await adminContext();
    const id = Number((await context.params).id);
    const body = schema.parse(await request.json());
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("잘못된 참가자입니다.");
    if (body.leftAt && body.leftAt < body.joinedAt) throw new Error("퇴장일은 참여일보다 빠를 수 없습니다.");
    const paidAt = resolvePaidAt(body.paidAmount, body.paidAt, kstDateKey());
    if (ctx.demo) return demoMutation();
    const { data: before, error: readError } = await ctx.db.from("participants").select("id,challenge_id,name,affiliation,joined_at,left_at,paid_amount,paid_at,is_active").eq("id", id).eq("challenge_id", body.challengeId).single();
    if (readError) throw readError;
    const { data: after, error } = await ctx.db.from("participants").update({
      name: body.name,
      ...(body.affiliation !== undefined ? { affiliation: body.affiliation } : {}),
      joined_at: body.joinedAt,
      left_at: body.leftAt ?? null,
      paid_amount: body.paidAmount,
      paid_at: paidAt,
      is_active: body.isActive,
    }).eq("id", id).eq("challenge_id", body.challengeId).select("id,challenge_id,name,affiliation,joined_at,left_at,paid_amount,paid_at,is_active").single();
    if (error) throw error;
    const changes = [
      before.left_at !== after.left_at ? "leave_update" : null,
      before.paid_amount !== after.paid_amount ? "payment_update" : null,
      before.paid_at !== after.paid_at ? "payment_confirm_update" : null,
      before.is_active !== after.is_active ? "activation_update" : null,
    ].filter(Boolean);
    await writeAudit({ challengeId: body.challengeId, operatorId: ctx.operatorId, action: changes.join("+") || "update", entityType: "participant", entityId: id, before, after });
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
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("잘못된 참가자입니다.");
    requireDeleteConfirmation(body.confirm);
    if (ctx.demo) return demoMutation();

    const [{ count: submissionCount, error: submissionError }, { count: exemptionCount, error: exemptionError }] = await Promise.all([
      ctx.db.from("submissions").select("id", { count: "exact", head: true }).eq("participant_id", id).eq("challenge_id", body.challengeId),
      ctx.db.from("exemptions").select("id", { count: "exact", head: true }).eq("participant_id", id).eq("challenge_id", body.challengeId),
    ]);
    if (submissionError) throw submissionError;
    if (exemptionError) throw exemptionError;
    if ((submissionCount ?? 0) > 0 || (exemptionCount ?? 0) > 0) {
      throw new Error("제출 또는 면제 기록이 있는 참가자는 삭제할 수 없습니다. 퇴장일을 입력하거나 비활성화해 주세요.");
    }

    const { data: before, error } = await ctx.db
      .from("participants")
      .delete()
      .eq("id", id)
      .eq("challenge_id", body.challengeId)
      .select("id,challenge_id,name,affiliation,joined_at,left_at,paid_amount,paid_at,is_active")
      .single();
    if (error) throw error;
    await writeAudit({ challengeId: body.challengeId, operatorId: ctx.operatorId, action: "delete", entityType: "participant", entityId: id, before });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

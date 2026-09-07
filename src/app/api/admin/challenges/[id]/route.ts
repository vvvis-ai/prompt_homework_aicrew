import { z } from "zod";
import {
  adminContext,
  apiError,
  demoMutation,
  requireDeleteConfirmation,
  writeAudit,
} from "@/server/admin-mutations";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  defaultFee: z.number().int().nonnegative(),
  defaultPenalty: z.number().int().nonnegative(),
});

const deleteSchema = z.object({
  confirm: z.literal("DELETE"),
  challengeName: z.string().trim().min(1).max(100),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await adminContext();
    const id = Number((await context.params).id);
    const body = updateSchema.parse(await request.json());
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("잘못된 기수입니다.");
    if (body.startDate > body.endDate) throw new Error("종료일은 시작일보다 빠를 수 없습니다.");
    if (ctx.demo) return demoMutation();
    const { data: before, error: readError } = await ctx.db.from("challenges").select("id,name,start_date,end_date,default_fee,default_penalty,is_active").eq("id", id).single();
    if (readError) throw readError;
    const { data: after, error } = await ctx.db.from("challenges").update({
      name: body.name,
      start_date: body.startDate,
      end_date: body.endDate,
      default_fee: body.defaultFee,
      default_penalty: body.defaultPenalty,
    }).eq("id", id).select("id,name,start_date,end_date,default_fee,default_penalty,is_active").single();
    if (error) throw error;
    await writeAudit({ challengeId: id, operatorId: ctx.operatorId, action: "update", entityType: "challenge", entityId: id, before, after });
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
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("잘못된 기수입니다.");
    if (ctx.demo) return demoMutation();

    const { data: challenge, error: readError } = await ctx.db
      .from("challenges")
      .select("id,name,is_active")
      .eq("id", id)
      .single();
    if (readError) throw readError;
    if (challenge.is_active) throw new Error("운영 중인 기수는 삭제할 수 없습니다. 먼저 다른 기수를 운영 기수로 전환해 주세요.");
    if (body.challengeName !== challenge.name) throw new Error("기수 이름이 일치하지 않습니다.");

    const relatedResults = await Promise.all([
      ctx.db.from("participants").select("id", { head: true, count: "exact" }).eq("challenge_id", id),
      ctx.db.from("submissions").select("id", { head: true, count: "exact" }).eq("challenge_id", id),
      ctx.db.from("exemptions").select("id", { head: true, count: "exact" }).eq("challenge_id", id),
      ctx.db.from("excluded_dates").select("id", { head: true, count: "exact" }).eq("challenge_id", id),
      ctx.db.from("notices").select("id", { head: true, count: "exact" }).eq("challenge_id", id),
    ]);
    const relatedError = relatedResults.find((result) => result.error)?.error;
    if (relatedError) throw relatedError;
    if (relatedResults.some((result) => (result.count ?? 0) > 0)) {
      throw new Error("참가자·제출물·면제일·제외일·공지 데이터가 있는 기수는 삭제할 수 없습니다. 관련 데이터를 먼저 정리해 주세요.");
    }

    const { error: rateDeleteError } = await ctx.db.from("penalty_rates").delete().eq("challenge_id", id);
    if (rateDeleteError) throw rateDeleteError;
    const { error: auditDeleteError } = await ctx.db.from("audit_logs").delete().eq("challenge_id", id);
    if (auditDeleteError) throw auditDeleteError;
    const { data: deleted, error: deleteError } = await ctx.db
      .from("challenges")
      .delete()
      .eq("id", id)
      .select("id")
      .single();
    if (deleteError) throw deleteError;

    return Response.json({ ok: true, id: String(deleted.id) });
  } catch (error) {
    return apiError(error);
  }
}

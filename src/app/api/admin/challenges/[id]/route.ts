import { z } from "zod";
import { adminContext, apiError, demoMutation, writeAudit } from "@/server/admin-mutations";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  defaultFee: z.number().int().nonnegative(),
  defaultPenalty: z.number().int().nonnegative(),
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

import { z } from "zod";
import { adminContext, apiError, demoMutation, writeAudit } from "@/server/admin-mutations";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  penaltyStartDate: z.iso.date().optional(),
  defaultFee: z.number().int().nonnegative(),
  defaultPenalty: z.number().int().nonnegative(),
});

export async function POST(request: Request) {
  try {
    const ctx = await adminContext();
    const body = createSchema.parse(await request.json());
    if (body.startDate > body.endDate) throw new Error("종료일은 시작일보다 빠를 수 없습니다.");
    const penaltyStartDate = body.penaltyStartDate ?? body.startDate;
    if (penaltyStartDate < body.startDate || penaltyStartDate > body.endDate) {
      throw new Error("차감 시작일은 기수 기간 안에 있어야 합니다.");
    }
    if (ctx.demo) return demoMutation();
    const { data, error } = await ctx.db.from("challenges").insert({
      name: body.name,
      start_date: body.startDate,
      end_date: body.endDate,
      penalty_start_date: penaltyStartDate,
      default_fee: body.defaultFee,
      default_penalty: body.defaultPenalty,
    }).select("id,name,start_date,end_date,penalty_start_date,default_fee,default_penalty,is_active").single();
    if (error) throw error;
    await writeAudit({ challengeId: data.id, operatorId: ctx.operatorId, action: "create", entityType: "challenge", entityId: data.id, after: data });
    return Response.json({ ok: true, id: String(data.id) });
  } catch (error) {
    return apiError(error);
  }
}

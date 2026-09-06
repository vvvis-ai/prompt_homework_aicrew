import { z } from "zod";
import { adminContext, apiError, demoMutation, writeAudit } from "@/server/admin-mutations";

const schema = z.object({ name: z.string().trim().min(1).max(60) });

export async function POST(request: Request) {
  try {
    const ctx = await adminContext();
    const body = schema.parse(await request.json());
    if (ctx.demo) return demoMutation();
    const { data, error } = await ctx.db.from("operators").insert({ name: body.name }).select("id,name,is_active").single();
    if (error) throw error;
    const { data: active } = await ctx.db.from("challenges").select("id").eq("is_active", true).maybeSingle();
    if (active) await writeAudit({ challengeId: active.id, operatorId: ctx.operatorId, action: "create", entityType: "operator", entityId: data.id, after: data });
    return Response.json({ ok: true, id: String(data.id) });
  } catch (error) {
    return apiError(error);
  }
}

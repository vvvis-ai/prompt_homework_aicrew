import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  createAdminToken,
  getAdminSession,
} from "@/server/admin-session";
import { getSupabaseAdmin, isDemoMode } from "@/server/supabase";

const schema = z.object({ operatorId: z.string().regex(/^\d+$/) });

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session.authenticated) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "운영자를 선택해주세요." }, { status: 400 });
  let operator = { id: parsed.data.operatorId, name: parsed.data.operatorId === "1" ? "이나윤" : "운영자" };
  if (!isDemoMode()) {
    const { data, error } = await getSupabaseAdmin()
      .from("operators")
      .select("id,name,is_active")
      .eq("id", Number(parsed.data.operatorId))
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "유효한 운영자가 아닙니다." }, { status: 404 });
    operator = { id: String(data.id), name: data.name };
  }
  const response = NextResponse.json({ success: true, operator });
  response.cookies.set(ADMIN_COOKIE, await createAdminToken(operator), adminCookieOptions);
  return response;
}

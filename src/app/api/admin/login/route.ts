import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  createAdminToken,
  verifyAdminPassword,
} from "@/server/admin-session";

const schema = z.object({ password: z.string().min(1).max(200) });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !(await verifyAdminPassword(parsed.data.password))) {
      return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다." }, { status: 401 });
    }
    const response = NextResponse.json({ success: true });
    response.cookies.set(ADMIN_COOKIE, await createAdminToken(), adminCookieOptions);
    return response;
  } catch (error) {
    console.error("Admin login failed", error);
    return NextResponse.json(
      { error: "로그인 처리 중 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}

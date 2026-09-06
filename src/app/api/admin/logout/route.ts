import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminCookieOptions } from "@/server/admin-session";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_COOKIE, "", { ...adminCookieOptions, maxAge: 0 });
  return response;
}


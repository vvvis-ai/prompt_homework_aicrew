import { jwtVerify } from "jose";
import { sendReminders } from "@/server/send-reminders";

export async function POST(request: Request) {
  try {
    const secret = process.env.ADMIN_SESSION_SECRET;
    if (!secret) throw new Error("Missing secret");
    await jwtVerify(request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "", new TextEncoder().encode(secret), { algorithms: ["HS256"], audience: "habit-reminder-cron", issuer: "habit-worker" });
  } catch { return Response.json({ error: "Unauthorized" }, { status: 401 }); }
  try { return Response.json(await sendReminders()); }
  catch { return Response.json({ error: "Reminder dispatch failed" }, { status: 500 }); }
}

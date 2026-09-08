import handler from "vinext/server/fetch-handler";
import { SignJWT } from "jose";

const worker = {
  fetch: handler.fetch,
  async scheduled(_event: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext) {
    const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setAudience("habit-reminder-cron").setIssuer("habit-worker").setExpirationTime("2m").sign(new TextEncoder().encode(env.ADMIN_SESSION_SECRET));
    const response = await handler.fetch(new Request("https://prompt-homework-aicrew.antae98.workers.dev/api/internal/reminders", { method: "POST", headers: { authorization: `Bearer ${token}` } }), env, ctx);
    if (!response.ok) throw new Error(`Reminder cron failed: ${response.status}`);
    console.log("habit-reminders", await response.json());
  },
};
export default worker;

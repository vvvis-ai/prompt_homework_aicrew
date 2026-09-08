import { z } from "zod";
import { isPushEndpoint } from "@/lib/habits";
import { getSupabaseAdmin, isDemoMode } from "@/server/supabase";
import { createHash } from "node:crypto";

const identity = z.object({ id: z.uuid(), token: z.uuid() });
const schema = identity.extend({ participantId: z.coerce.number().int().positive(), time: z.string().regex(/^(0[8-9]|1[0-9]|2[0-2]):(00|15|30|45)$/), endpoint: z.string().max(2048).refine(isPushEndpoint) });
function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new Error("잘못된 요청입니다.");
}
export async function GET() {
  return Response.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (isDemoMode()) return Response.json({ error: "체험 모드에서는 알림을 등록하지 않습니다." }, { status: 400 });
    const body = schema.parse(await request.json());
    const db = getSupabaseAdmin();
    const { data: participant, error: pe } = await db.from("participants").select("id,challenge_id").eq("id", body.participantId).eq("is_active", true).single();
    if (pe) throw pe;
    const { data: challenge } = await db.from("challenges").select("id").eq("id", participant.challenge_id).eq("is_active", true).maybeSingle();
    if (!challenge) throw new Error("운영 중인 기수의 참가자를 선택해주세요.");
    const tokenHash = createHash("sha256").update(body.token).digest("hex");
    const row = { id: body.id, participant_id: body.participantId, endpoint: body.endpoint, token_hash: tokenHash, reminder_time: body.time };
    const { data: existing, error: ee } = await db.from("push_reminders").select("id").eq("id", body.id).maybeSingle();
    if (ee) throw ee;
    const result = existing
      ? await db.from("push_reminders").update(row).eq("id", body.id).eq("token_hash", tokenHash).select("id").single()
      : await db.from("push_reminders").insert(row).select("id").single();
    if (result.error) throw new Error("알림을 저장하지 못했습니다. 이 기기의 기존 알림을 끈 뒤 다시 시도해주세요.");
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "알림을 저장하지 못했습니다." }, { status: 400 }); }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const body = identity.parse(await request.json());
    const { error } = await getSupabaseAdmin().from("push_reminders").delete().eq("id", body.id).eq("token_hash", createHash("sha256").update(body.token).digest("hex"));
    if (error) throw error;
    return Response.json({ ok: true });
  } catch { return Response.json({ error: "알림을 해제하지 못했습니다." }, { status: 400 }); }
}

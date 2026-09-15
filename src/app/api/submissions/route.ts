import { hashPassword } from "@/server/password-service";
import { isSubmissionOnTime } from "@/lib/time";
import { normalizeUrl } from "@/lib/url";
import { getSupabaseAdmin, isDemoMode } from "@/server/supabase";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  participantId: z.string().regex(/^\d+$/),
  title: z.string().trim().max(120).optional().default(""),
  url: z.string().trim().min(1).max(2048),
  description: z.string().trim().max(1000).optional().default(""),
  password: z.string().min(4).max(72),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "필수 입력값과 형식을 확인해주세요." }, { status: 400 });
  }
  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeUrl(parsed.data.url);
  } catch {
    return Response.json({ error: "http 또는 https로 시작하는 정상적인 링크를 입력해주세요." }, { status: 400 });
  }
  const now = new Date();
  if (isDemoMode()) {
    return Response.json({
      success: true,
      onTime: isSubmissionOnTime(now),
      submission: {
        id: `demo-${Date.now()}`,
        submittedAt: now.toISOString(),
        normalizedUrl,
      },
    });
  }
  try {
    const db = getSupabaseAdmin();
    const { data: challenge } = await db.from("challenges").select("id,start_date,end_date").eq("is_active", true).maybeSingle();
    if (!challenge) return Response.json({ error: "현재 진행 중인 기수가 없습니다." }, { status: 409 });
    const { data: participant } = await db
      .from("participants")
      .select("id,challenge_id,is_active,joined_at,left_at")
      .eq("id", Number(parsed.data.participantId))
      .eq("challenge_id", challenge.id)
      .maybeSingle();
    if (!participant?.is_active) return Response.json({ error: "유효한 참가자가 아닙니다." }, { status: 403 });
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    if (today < challenge.start_date || today > challenge.end_date || today < participant.joined_at || (participant.left_at && today > participant.left_at)) {
      return Response.json({ error: "현재 이 기수에 참여 중인 참가자가 아닙니다." }, { status: 403 });
    }
    const passwordHash = await hashPassword(parsed.data.password);
    const { data, error } = await db
      .from("submissions")
      .insert({
        challenge_id: challenge.id,
        participant_id: participant.id,
        title: parsed.data.title || null,
        url: parsed.data.url,
        normalized_url: normalizedUrl,
        description: parsed.data.description || null,
        edit_password_hash: passwordHash,
      })
      .select("id,submitted_at")
      .single();
    if (error?.code === "23505") {
      return Response.json({ error: "이미 등록한 링크입니다." }, { status: 409 });
    }
    if (error) throw error;
    return Response.json({
      success: true,
      onTime: isSubmissionOnTime(data.submitted_at),
      submission: { id: String(data.id), submittedAt: data.submitted_at, normalizedUrl },
    });
  } catch (error) {
    console.error("submission create error", error);
    return Response.json({ error: "링크를 등록하지 못했습니다." }, { status: 500 });
  }
}

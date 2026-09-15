import { hashPassword } from "@/server/password-service";
import { isSubmissionOnTime, kstDateKey } from "@/lib/time";
import { isVoluntarySharingChallenge } from "@/lib/participation";
import { getSubmissionUrlError, normalizeUrl } from "@/lib/url";
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
  const urlError = getSubmissionUrlError(parsed.data.url);
  if (urlError) return Response.json({ error: urlError }, { status: 400 });
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
    const { data: participant, error: participantError } = await db
      .from("participants")
      .select("id,challenge_id,is_active,joined_at,left_at")
      .eq("id", Number(parsed.data.participantId))
      .maybeSingle();
    if (participantError) throw participantError;
    if (!participant) return Response.json({ error: "유효한 참가자가 아닙니다." }, { status: 403 });
    const { data: challenge, error: challengeError } = await db.from("challenges")
      .select("id,start_date,end_date,is_active").eq("id", participant.challenge_id).maybeSingle();
    if (challengeError) throw challengeError;
    if (!challenge) return Response.json({ error: "기수를 찾을 수 없습니다." }, { status: 403 });
    const today = kstDateKey(now);
    const sharingOnly = isVoluntarySharingChallenge(challenge, today);
    if (!sharingOnly && (!challenge.is_active || !participant.is_active || today < challenge.start_date || today > challenge.end_date || today < participant.joined_at || (participant.left_at && today >= participant.left_at))) {
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
      sharingOnly,
      onTime: !sharingOnly && isSubmissionOnTime(data.submitted_at),
      submission: { id: String(data.id), submittedAt: data.submitted_at, normalizedUrl },
    });
  } catch (error) {
    console.error("submission create error", error);
    return Response.json({ error: "링크를 등록하지 못했습니다." }, { status: 500 });
  }
}

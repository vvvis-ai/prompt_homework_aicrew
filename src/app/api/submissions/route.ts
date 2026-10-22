import { hashPassword } from "@/server/password-service";
import { isSubmissionOnTime, kstDateKey } from "@/lib/time";
import { isVoluntarySharingChallenge } from "@/lib/participation";
import { getSubmissionUrlError, normalizeUrl } from "@/lib/url";
import { getSupabaseAdmin, isDemoMode } from "@/server/supabase";
import { z } from "zod";
import { readSubmissionInput, SubmissionInputError } from "@/server/submission-input";
import { submissionDetailUrl } from "@/lib/html-submission";

export const runtime = "nodejs";

const schema = z.object({
  participantId: z.string().regex(/^\d+$/),
  title: z.string().trim().max(120).optional().default(""),
  url: z.string().trim().min(1).max(2048),
  description: z.string().trim().max(1000).optional().default(""),
  password: z.string().min(4).max(72),
});

export async function POST(request: Request) {
  let input;
  try { input = await readSubmissionInput(request); }
  catch (error) {
    return Response.json({ error: error instanceof SubmissionInputError ? error.message : "입력 내용을 확인해주세요." }, { status: error instanceof SubmissionInputError ? error.status : 400 });
  }
  const html = input.html;
  const parsed = schema.safeParse(html ? { ...input.fields, url: `html:${crypto.randomUUID()}` } : input.fields);
  if (!parsed.success) {
    return Response.json({ error: "필수 입력값과 형식을 확인해주세요." }, { status: 400 });
  }
  const urlError = html ? null : getSubmissionUrlError(parsed.data.url);
  if (urlError) return Response.json({ error: urlError }, { status: 400 });
  let normalizedUrl: string;
  try {
    normalizedUrl = html ? parsed.data.url : normalizeUrl(parsed.data.url);
  } catch {
    return Response.json({ error: "http 또는 https로 시작하는 정상적인 링크를 입력해주세요." }, { status: 400 });
  }
  const now = new Date();
  if (isDemoMode()) {
    if (html) return Response.json({ error: "HTML 업로드는 DB가 연결된 환경에서 저장할 수 있습니다. 현재는 체험 모드입니다." }, { status: 503 });
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
        ...(html ? { html_file_name: html.name, html_content: html.content } : {}),
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
      submission: { id: String(data.id), submittedAt: data.submitted_at, normalizedUrl, url: html ? submissionDetailUrl(data.id) : parsed.data.url },
    });
  } catch (error) {
    console.error("submission create error", error);
    return Response.json({ error: "제출물을 등록하지 못했습니다." }, { status: 500 });
  }
}

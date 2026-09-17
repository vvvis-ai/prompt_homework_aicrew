import { z } from "zod";
import { kstDateKey } from "@/lib/time";
import { getSubmissionUrlError, normalizeUrl } from "@/lib/url";
import { adminContext, apiError, demoMutation, writeAudit } from "@/server/admin-mutations";
import { hashPassword } from "@/server/password-service";

export const runtime = "nodejs";

const schema = z.object({
  challengeId: z.coerce.number().int().positive(),
  participantId: z.coerce.number().int().positive(),
  title: z.string().trim().max(120).optional().default(""),
  url: z.string().trim().min(1).max(2048),
  description: z.string().trim().max(1000).optional().default(""),
  submittedAt: z.string().max(40),
});

export async function POST(request: Request) {
  try {
    const ctx = await adminContext();
    const body = schema.parse(await request.json());
    const urlError = getSubmissionUrlError(body.url);
    if (urlError) throw new Error(urlError);
    const submittedAt = new Date(body.submittedAt);
    if (!Number.isFinite(submittedAt.getTime())) throw new Error("유효한 제출일시를 입력해주세요.");
    if (submittedAt.getTime() > Date.now()) throw new Error("미래 시각으로 제출물을 등록할 수 없습니다.");
    if (ctx.demo) return demoMutation();

    const { data: participant, error: participantError } = await ctx.db
      .from("participants")
      .select("id,challenge_id,joined_at,left_at")
      .eq("id", body.participantId)
      .eq("challenge_id", body.challengeId)
      .maybeSingle();
    if (participantError) throw participantError;
    if (!participant) throw new Error("선택한 기수의 참가자가 아닙니다.");

    const { data: challenge, error: challengeError } = await ctx.db
      .from("challenges")
      .select("id,start_date,end_date")
      .eq("id", body.challengeId)
      .maybeSingle();
    if (challengeError) throw challengeError;
    if (!challenge) throw new Error("기수를 찾을 수 없습니다.");

    const submittedDate = kstDateKey(submittedAt);
    if (submittedDate < challenge.start_date || submittedDate > challenge.end_date) {
      throw new Error("기수 운영 기간 안의 제출일시를 입력해주세요.");
    }
    if (submittedDate < participant.joined_at || (participant.left_at && submittedDate >= participant.left_at)) {
      throw new Error("참가자의 참여 기간 안의 제출일시를 입력해주세요.");
    }

    const passwordHash = await hashPassword(crypto.randomUUID());
    const { data: created, error } = await ctx.db.from("submissions").insert({
      challenge_id: body.challengeId,
      participant_id: body.participantId,
      title: body.title || null,
      url: body.url,
      normalized_url: normalizeUrl(body.url),
      description: body.description || null,
      edit_password_hash: passwordHash,
      submitted_at: submittedAt.toISOString(),
    }).select("id,challenge_id,participant_id,title,url,normalized_url,description,is_featured,submitted_at").single();
    if (error?.code === "23505") throw new Error("이 참가자에게 이미 등록된 링크입니다.");
    if (error) throw error;

    await writeAudit({
      challengeId: body.challengeId,
      operatorId: ctx.operatorId,
      action: "create_manual",
      entityType: "submission",
      entityId: created.id,
      after: created,
    });
    return Response.json({ ok: true, submissionId: String(created.id) });
  } catch (error) {
    return apiError(error);
  }
}

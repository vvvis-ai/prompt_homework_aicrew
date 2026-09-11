import { z } from "zod";
import { adminContext, apiError, writeAudit } from "@/server/admin-mutations";
import { sendTestReminders } from "@/server/send-reminders";

export async function POST(request: Request) {
  try {
    const ctx = await adminContext();
    const body = z.object({ participantId: z.coerce.number().int().positive() }).parse(await request.json());
    if (ctx.demo) return Response.json({ demo: true, sent: 0, failed: 0, expired: 0 });
    const { data: participant, error } = await ctx.db
      .from("participants")
      .select("id,name,challenge_id")
      .eq("id", body.participantId)
      .single();
    if (error) throw error;
    const result = await sendTestReminders(body.participantId);
    await writeAudit({
      challengeId: participant.challenge_id,
      operatorId: ctx.operatorId,
      action: "test_push",
      entityType: "participant",
      entityId: participant.id,
      after: { participantName: participant.name, ...result },
    });
    if (!result.sent) {
      return Response.json({ error: "푸시 서비스가 테스트 알림을 받지 못했습니다.", ...result }, { status: 502 });
    }
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}

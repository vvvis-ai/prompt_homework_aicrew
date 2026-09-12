import "server-only";

import type { Json } from "@/server/database.types";
import { requireOperator } from "@/server/admin-session";
import { getSupabaseAdmin, isDemoMode } from "@/server/supabase";

export async function adminContext() {
  const operator = await requireOperator();
  const operatorId = Number(operator.operatorId);
  if (!Number.isSafeInteger(operatorId) || operatorId < 1) throw new Error("UNAUTHORIZED");
  return { ...operator, operatorId, db: getSupabaseAdmin(), demo: isDemoMode() };
}

export async function writeAudit(input: {
  challengeId: number;
  operatorId: number;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  before?: Json | null;
  after?: Json | null;
}) {
  const { error } = await getSupabaseAdmin().from("audit_logs").insert({
    challenge_id: input.challengeId,
    operator_id: input.operatorId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId == null ? null : String(input.entityId),
    before_data: input.before ?? null,
    after_data: input.after ?? null,
  });
  if (error) throw error;
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
  if (message === "UNAUTHORIZED") {
    return Response.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  return Response.json({ error: message }, { status: 400 });
}

export function demoMutation() {
  return Response.json({ ok: true, demo: true });
}

export function requireDeleteConfirmation(value: unknown) {
  if (value !== "DELETE") throw new Error("삭제 확인 문구가 올바르지 않습니다.");
}

export function resolvePaidAt(
  paidAmount: number,
  paidAt: string | null | undefined,
  today: string,
): string | null {
  if (paidAmount <= 0 || !paidAt) return null;
  if (paidAt > today) throw new Error("납부 확인일은 오늘 이후로 지정할 수 없습니다.");
  return paidAt;
}

import { compare } from "bcryptjs";
import { canParticipantEdit } from "@/lib/time";
import { normalizeUrl } from "@/lib/url";
import { getSupabaseAdmin, isDemoMode } from "@/server/supabase";
import type { Database } from "@/server/database.types";
import { z } from "zod";

export const runtime = "nodejs";

const mutationSchema = z.object({
  participantId: z.string().regex(/^\d+$/),
  password: z.string().min(4).max(72),
  title: z.string().trim().max(120).optional(),
  url: z.string().trim().min(1).max(2048).optional(),
  description: z.string().trim().max(1000).optional(),
});

async function loadAndVerify(id: string, participantId: string, password: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("submissions")
    .select("id,participant_id,submitted_at,edit_password_hash")
    .eq("id", Number(id))
    .eq("participant_id", Number(participantId))
    .maybeSingle();
  if (error) throw error;
  if (!data) return { error: "게시물을 찾을 수 없습니다.", status: 404 } as const;
  if (!canParticipantEdit(data.submitted_at)) {
    return { error: "수정·삭제 가능 시간이 지났습니다. 제출 당일 23:00까지만 가능합니다.", status: 403 } as const;
  }
  if (!(await compare(password, data.edit_password_hash))) {
    return { error: "수정·삭제 비밀번호가 일치하지 않습니다.", status: 403 } as const;
  }
  return { data, db } as const;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "입력값을 확인해주세요." }, { status: 400 });
  if (isDemoMode()) return Response.json({ success: true });
  try {
    const verified = await loadAndVerify(id, parsed.data.participantId, parsed.data.password);
    if ("error" in verified) return Response.json({ error: verified.error }, { status: verified.status });
    let normalizedUrl: string | undefined;
    if (parsed.data.url) {
      try {
        normalizedUrl = normalizeUrl(parsed.data.url);
      } catch {
        return Response.json({ error: "정상적인 URL을 입력해주세요." }, { status: 400 });
      }
    }
    const changes: Database["public"]["Tables"]["submissions"]["Update"] = {};
    if (parsed.data.title !== undefined) changes.title = parsed.data.title || null;
    if (parsed.data.description !== undefined) changes.description = parsed.data.description || null;
    if (parsed.data.url !== undefined) {
      changes.url = parsed.data.url;
      changes.normalized_url = normalizedUrl as string;
    }
    const { error } = await verified.db.from("submissions").update(changes).eq("id", Number(id));
    if (error?.code === "23505") return Response.json({ error: "이미 등록한 링크입니다." }, { status: 409 });
    if (error) throw error;
    return Response.json({ success: true });
  } catch (error) {
    console.error("submission update error", error);
    return Response.json({ error: "프롬프트를 수정하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = mutationSchema.pick({ participantId: true, password: true }).safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return Response.json({ error: "입력값을 확인해주세요." }, { status: 400 });
  if (isDemoMode()) return Response.json({ success: true });
  try {
    const verified = await loadAndVerify(id, parsed.data.participantId, parsed.data.password);
    if ("error" in verified) return Response.json({ error: verified.error }, { status: verified.status });
    const { error } = await verified.db.from("submissions").delete().eq("id", Number(id));
    if (error) throw error;
    return Response.json({ success: true });
  } catch (error) {
    console.error("submission delete error", error);
    return Response.json({ error: "프롬프트를 삭제하지 못했습니다." }, { status: 500 });
  }
}

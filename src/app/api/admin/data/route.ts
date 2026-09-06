import { z } from "zod";
import { getAdminSession } from "@/server/admin-session";
import { getAdminData, getOperatorChoices } from "@/server/admin-data";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  challengeId: z.string().regex(/^\d+$/).optional(),
});

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session.authenticated) return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  if (!session.operatorId) {
    return Response.json({ session, operators: await getOperatorChoices() });
  }
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "조회 조건이 올바르지 않습니다." }, { status: 400 });
  try {
    return Response.json(
      await getAdminData(parsed.data.month, parsed.data.challengeId, session),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("admin data error", error);
    return Response.json({ error: "관리자 데이터를 불러오지 못했습니다." }, { status: 500 });
  }
}

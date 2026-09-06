import { getAppData } from "@/server/app-data";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  participantId: z.string().regex(/^\d+$/).optional(),
  date: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("all")]).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  search: z.string().max(100).optional(),
  featuredOnly: z.enum(["true", "false"]).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return Response.json({ error: "조회 조건이 올바르지 않습니다." }, { status: 400 });
  }
  try {
    const data = await getAppData({
      ...parsed.data,
      featuredOnly: parsed.data.featuredOnly === "true",
    });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("app data error", error);
    return Response.json({ error: "데이터를 불러오지 못했습니다." }, { status: 500 });
  }
}

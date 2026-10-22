import { HTML_PREVIEW_CSP } from "@/lib/html-submission";
import { getHtmlSubmission } from "@/server/html-submissions";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = {
    "Content-Security-Policy": HTML_PREVIEW_CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "X-Frame-Options": "SAMEORIGIN",
  };
  try {
    const submission = await getHtmlSubmission((await context.params).id);
    if (!submission) return new Response("웹페이지를 찾을 수 없습니다.", { status: 404, headers });
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(submission.html_content, { headers: {
      ...headers,
      "Content-Type": download ? "application/octet-stream" : "text/html; charset=utf-8",
      ...(download ? { "Content-Disposition": `attachment; filename="webpage.html"; filename*=UTF-8''${encodeURIComponent(submission.html_file_name!)}` } : {}),
    } });
  } catch {
    return new Response("웹페이지를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.", { status: 503, headers });
  }
}

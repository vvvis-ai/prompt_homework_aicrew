import Link from "next/link";
import { notFound } from "next/navigation";
import { getHtmlSubmission } from "@/server/html-submissions";
import { getSupabaseAdmin } from "@/server/supabase";
import { submissionPreviewUrl } from "@/lib/html-submission";

export const dynamic = "force-dynamic";

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const submission = await getHtmlSubmission(id);
  if (!submission) notFound();
  const { data: author } = await getSupabaseAdmin().from("participants").select("name").eq("id", submission.participant_id).maybeSingle();
  return <main className="mx-auto max-w-6xl px-4 py-8">
    <Link href="/" className="text-sm font-bold text-blue-700">← AI 러닝크루로 돌아가기</Link>
    <section className="surface-card mt-5">
      <p className="text-sm font-bold text-blue-700">HTML 웹페이지 · {author?.name ?? "참가자"}</p>
      <h1 className="mt-2 break-words text-2xl font-black">{submission.title || submission.html_file_name}</h1>
      <p className="mt-2 text-sm text-slate-500">{new Date(submission.submitted_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
      {submission.description && <p className="mt-4 whitespace-pre-wrap break-words leading-7 text-slate-600">{submission.description}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <a className="secondary-button" href={`${submissionPreviewUrl(id)}?download=1`}>HTML 원본 다운로드</a>
        <a className="secondary-button" href={submissionPreviewUrl(id)} target="_blank" rel="noopener noreferrer">웹페이지 크게 보기 ↗</a>
      </div>
      <p className="mt-4 text-xs leading-6 text-slate-500">{submission.html_file_name} · 외부 API 요청, 로그인·저장 기능, 팝업 등은 미리보기에서 제한될 수 있습니다.</p>
    </section>
    <iframe className="mt-5 h-[75vh] min-h-[480px] w-full rounded-2xl border border-slate-200 bg-white" src={submissionPreviewUrl(id)} title={`${submission.title || submission.html_file_name} 웹페이지`} sandbox="allow-scripts" referrerPolicy="no-referrer" />
  </main>;
}

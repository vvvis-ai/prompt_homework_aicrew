"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { submissionDetailUrl, submissionPreviewUrl } from "@/lib/html-submission";
import type { Submission } from "@/lib/types";

export function HtmlSubmissionPreview({ submission }: { submission: Submission }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const isHtml = Boolean(submission.htmlFileName);
  useEffect(() => {
    const element = viewport.current;
    if (!element || !isHtml) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 1200));
    observer.observe(element);
    return () => observer.disconnect();
  }, [isHtml]);
  if (!submission.htmlFileName) return null;
  const previewUrl = `${submissionPreviewUrl(submission.id)}?v=${encodeURIComponent(submission.htmlUpdatedAt ?? submission.submittedAt)}`;
  return <Link href={submissionDetailUrl(submission.id)} className="html-thumbnail mt-4 block overflow-hidden rounded-2xl border border-slate-200 bg-white focus-visible:outline-2 focus-visible:outline-blue-600" aria-label={`${submission.title || submission.htmlFileName} 웹페이지 상세 보기`}>
    <div ref={viewport} className="relative aspect-[16/9] overflow-hidden" aria-hidden="true">
      <iframe className="pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-white" style={{ width: 1200, height: 675, transform: `scale(${scale})` }} src={previewUrl} title="HTML 웹페이지 썸네일" loading="lazy" sandbox="allow-scripts" referrerPolicy="no-referrer" tabIndex={-1} />
      <span className="absolute inset-0" />
    </div>
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold"><span className="truncate">{submission.htmlFileName}</span><span className="shrink-0 text-blue-700">상세 보기 →</span></div>
  </Link>;
}

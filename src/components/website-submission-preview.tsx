"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getWebsitePreviewSandbox, isDeploymentUrl } from "@/lib/url";
import type { Submission } from "@/lib/types";

export function WebsiteSubmissionPreview({ submission }: { submission: Submission }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const isWebsite = !submission.htmlFileName && isDeploymentUrl(submission.url);
  const prepareFrame = useCallback((frame: HTMLIFrameElement | null) => {
    if (!frame) return;
    // Keep same-origin submissions opaque; cross-origin sites may need storage to render.
    frame.setAttribute("sandbox", getWebsitePreviewSandbox(submission.url, window.location.origin));
    // Supported browsers use temporary storage and omit the viewer's cookies.
    frame.setAttribute("credentialless", "");
    frame.src = submission.url;
  }, [submission.url]);

  useEffect(() => {
    const element = viewport.current;
    if (!element || !isWebsite) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 1200));
    observer.observe(element);
    return () => observer.disconnect();
  }, [isWebsite]);

  if (!isWebsite) return null;

  return <a href={submission.url} target="_blank" rel="noopener noreferrer" className="mt-4 block overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600" aria-label={`${submission.title || "배포된 웹사이트"} 새 창에서 열기`}>
    <div ref={viewport} className="relative aspect-[16/9] overflow-hidden bg-white" aria-hidden="true">
      <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-slate-500">웹사이트 미리보기를 불러오고 있어요.</div>
      <iframe ref={prepareFrame} className="pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-white" style={{ width: 1200, height: 675, transform: `scale(${scale})` }} title="배포된 웹사이트 미리보기" loading="lazy" sandbox="allow-scripts" referrerPolicy="no-referrer" tabIndex={-1} />
      <span className="absolute inset-0" />
    </div>
    <div className="border-t border-slate-100 px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-sm font-bold"><span>웹사이트 미리보기</span><span className="shrink-0 text-blue-700">새 창에서 열기 →</span></div>
      <p className="mt-1 text-xs leading-5 text-slate-500">미리보기가 표시되지 않으면 새 창에서 열어주세요.</p>
    </div>
  </a>;
}

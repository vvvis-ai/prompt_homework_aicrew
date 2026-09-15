"use client";

import Image from "next/image";
import { CircleHelp, X } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";

const guides = [
  { id: "chatgpt", name: "ChatGPT", width: 678, height: 372, instruction: "대화 상단의 ‘공유하기’를 누른 뒤 링크를 복사해주세요.", alt: "ChatGPT 대화 상단의 공유하기 버튼이 빨간색 테두리로 표시된 화면" },
  { id: "gemini", name: "Gemini", width: 661, height: 217, instruction: "더보기(⋮)에서 ‘대화 공유’를 누른 뒤 링크를 복사해주세요.", alt: "Gemini의 더보기 메뉴와 대화 공유 버튼이 빨간색 테두리로 표시된 화면" },
  { id: "claude", name: "Claude", width: 729, height: 351, instruction: "‘공유’를 누르고 ‘링크가 있는 모든 사람’을 선택한 뒤 링크를 복사해주세요.", alt: "Claude의 공유 버튼과 링크가 있는 모든 사람 옵션이 빨간색 테두리로 표시된 화면" },
];

export function ShareLinkHelp({ id, error, errorId }: { id: string; error: string | null; errorId: string }) {
  const popupId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const guide = guides[activeTab];

  // Keep the top-layer popover next to its trigger, including inside the edit dialog.
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      if (!trigger.current || !popup.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const panel = popup.current.getBoundingClientRect();
      const margin = 12;
      const gap = 8;
      const viewportWidth = document.documentElement.clientWidth;
      const beside = anchor.right + gap + panel.width <= viewportWidth - margin;
      const left = beside ? anchor.right + gap : Math.max(margin, Math.min(anchor.left, viewportWidth - panel.width - margin));
      const preferredTop = beside ? anchor.top : anchor.bottom + gap;
      const top = Math.max(margin, Math.min(preferredTop, window.innerHeight - panel.height - margin));
      popup.current.style.left = `${left}px`;
      popup.current.style.top = `${top}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    if (popup.current) observer.observe(popup.current);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  return (
    <div className={`rounded-xl border p-3 text-sm font-normal leading-6 ${error ? "border-amber-200 bg-amber-50 text-amber-950" : "border-blue-100 bg-blue-50 text-slate-600"}`}>
      <p id={id} className="text-xs">AI 대화의 공유 기능으로 만든 링크를 남겨주세요.</p>
      {error && <p id={errorId} role="alert" className="mt-1">{error}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button ref={trigger} type="button" popoverTarget={popupId} aria-haspopup="dialog" aria-expanded={open} aria-controls={popupId} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 font-bold text-blue-700 underline underline-offset-4 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <CircleHelp size={16} aria-hidden="true" />공유방법
        </button>
        {error && <span className="text-xs">입력한 내용은 유지됩니다. 링크만 바꿔주세요.</span>}
      </div>
      <div ref={popup} id={popupId} popover="auto" role="dialog" aria-labelledby={`${popupId}-title`} onToggle={(event) => setOpen(event.newState === "open")} className="share-guide-popover" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h2 id={`${popupId}-title`} className="text-base font-extrabold text-slate-950">공유방법</h2>
          <button type="button" popoverTarget={popupId} popoverTargetAction="hide" aria-label="공유방법 닫기" className="grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100" onClick={() => trigger.current?.focus()}><X size={18} aria-hidden="true" /></button>
        </div>
        <div role="tablist" aria-label="AI 서비스" className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1">
          {guides.map((item, index) => <button key={item.id} id={`${popupId}-tab-${item.id}`} type="button" role="tab" aria-selected={activeTab === index} aria-controls={`${popupId}-panel-${item.id}`} tabIndex={activeTab === index ? 0 : -1} className={`min-h-10 flex-1 rounded-lg px-2 text-sm font-bold ${activeTab === index ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-900"}`} onClick={() => setActiveTab(index)} onKeyDown={(event) => {
            let next = index;
            if (event.key === "ArrowRight") next = (index + 1) % guides.length;
            else if (event.key === "ArrowLeft") next = (index + guides.length - 1) % guides.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = guides.length - 1;
            else return;
            event.preventDefault();
            setActiveTab(next);
            document.getElementById(`${popupId}-tab-${guides[next].id}`)?.focus();
          }}>{item.name}</button>)}
        </div>
        {guides.map((item, index) => <div key={item.id} id={`${popupId}-panel-${item.id}`} role="tabpanel" aria-labelledby={`${popupId}-tab-${item.id}`} hidden={activeTab !== index} tabIndex={0}>
          {activeTab === index && <>
            <p className="my-3 text-sm leading-6 text-slate-700">{guide.instruction}</p>
            <Image src={`/share-guides/${guide.id}.png`} width={guide.width} height={guide.height} alt={guide.alt} unoptimized className="h-auto w-full rounded-xl border border-slate-200" />
          </>}
        </div>)}
        <p className="mt-3 text-xs leading-5 text-slate-500">복사한 링크를 AI 활용 링크 입력란에 붙여넣어주세요.</p>
      </div>
    </div>
  );
}

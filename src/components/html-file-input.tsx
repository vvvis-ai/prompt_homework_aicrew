"use client";

import { useId, useRef, useState } from "react";
import { FileCode2, Upload, X } from "lucide-react";
import { htmlFileError } from "@/lib/html-submission";

export function HtmlFileInput({ file, onChange, disabled = false, optional = false }: { file: File | null; onChange: (file: File | null) => void; disabled?: boolean; optional?: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  function select(files: FileList | null) {
    if (disabled) return;
    if (!files?.length) return;
    const problem = files.length !== 1 ? "HTML 파일은 한 번에 한 개만 선택해주세요." : htmlFileError(files[0]);
    setError(problem ?? "");
    onChange(problem ? null : files[0]);
  }
  return <div className="grid gap-2">
    <label htmlFor={id} className="font-extrabold">HTML 웹페이지 {optional ? "교체 (선택)" : <span className="text-red-500">*</span>}</label>
    <div className={`rounded-2xl border-2 border-dashed p-6 text-center ${dragging ? "border-blue-500 bg-blue-100" : "border-blue-200 bg-blue-50/50"}`} onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); select(event.dataTransfer.files); }}>
      <Upload className="mx-auto text-blue-600" size={28} />
      <p className="mt-3 font-bold">HTML 파일을 여기에 끌어다 놓으세요</p>
      <button className="secondary-button mx-auto mt-3" type="button" disabled={disabled} onClick={() => input.current?.click()}>파일 선택</button>
      <input ref={input} id={id} type="file" accept=".html,.htm,text/html" className="sr-only" disabled={disabled} aria-describedby={`${id}-help ${id}-error`} onChange={(event) => { select(event.target.files); event.target.value = ""; }} />
      <p id={`${id}-help`} className="mt-3 text-xs leading-6 text-slate-500">.html / .htm · 최대 2MB · UTF-8<br />이미지·CSS·JavaScript를 파일 안에 포함하거나 외부 HTTPS 주소로 연결해주세요. 폴더·ZIP은 지원하지 않습니다.</p>
    </div>
    {file && <div className="flex min-w-0 items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm"><FileCode2 size={18} className="shrink-0 text-emerald-700" /><span className="min-w-0 flex-1 break-all font-bold">{file.name} · {Math.ceil(file.size / 1024)}KB</span><button type="button" disabled={disabled} aria-label="선택한 파일 제거" onClick={() => onChange(null)}><X size={18} /></button></div>}
    <p id={`${id}-error`} role="alert" className="text-sm text-red-600">{error}</p>
  </div>;
}

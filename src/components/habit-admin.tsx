"use client";

import { FormEvent, useEffect, useState } from "react";
import { Copy, Plus, Sparkles, Trash2 } from "lucide-react";
import type { AdminData, DailyStatus } from "@/lib/types";
import { kstDateKey } from "@/lib/time";
import { starterMission } from "@/lib/habits";

export function HabitOverview({ data }: { data: AdminData }) {
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");
  const activeIds = new Set(data.habit.filter((person) => person.active).map((person) => person.participantId));
  const people = data.today.filter((person) => activeIds.has(person.participantId));
  const visible = people.filter((person) => filter === "all" || person.status === filter);
  const week = data.habit.flatMap((person) => person.week);
  const completed = week.filter((day) => day.status === "completed").length;
  const target = week.filter((day) => ["completed", "pending", "missed"].includes(day.status)).length;
  const needsHelp = data.habit.filter((person) => person.active && person.recentMisses >= 2);
  const labels: Record<DailyStatus, string> = { completed: "오늘 실천 완료", pending: "마감 전 미제출", missed: "미제출 확정", exempt: "면제", excluded: "쉬는 날", future: "예정", not_enrolled: "대상 아님" };
  async function copy() {
    const pending = people.filter((person) => person.status === "pending");
    if (!pending.length) { setMessage("현재 마감 전 미제출자가 없습니다."); return; }
    const text = `오늘 AI와 3분, 함께해요 🌱\n아직 링크를 남기지 않으셨다면 가벼운 질문 하나부터 해보세요. 결과가 완벽하지 않아도 괜찮아요.\n23:00까지 직접 써본 AI 링크를 남겨주세요.\nhttps://prompt-homework-aicrew.antae98.workers.dev`;
    try { await navigator.clipboard.writeText(text); setMessage(`안내문을 복사했습니다. 현재 미제출 ${pending.length}명에게 전달할 수 있습니다. 이름은 문구에 포함하지 않았습니다.`); }
    catch { setMessage(text); }
  }
  return <div className="grid gap-5"><section className="habit-admin-hero"><div><p className="habit-eyebrow">꾸준함을 돕는 운영</p><h2 className="mt-2 text-2xl font-black">좋은 결과보다, 오늘 한 번의 사용</h2><p className="mt-2 text-sm text-slate-600">아래 실천 현황은 조회 월과 관계없이 이번 주 기준입니다.</p></div><div className="mt-5 grid grid-cols-3 gap-3"><Metric label="오늘 실천" value={`${people.filter((p) => p.status === "completed").length}명`} /><Metric label="이번 주 실천" value={`${completed}/${target}회`} /><Metric label="안부 확인" value={`${needsHelp.length}명`} /></div></section><section className="surface-card"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-black">오늘의 참여</h2><button className="filter-button" onClick={() => void copy()}><Copy size={16} />미제출 안내문 복사</button></div><div className="mt-4 flex flex-wrap gap-2">{[["all", "전체"], ["pending", "마감 전 미제출"], ["completed", "완료"], ["missed", "미제출 확정"]].map(([value, label]) => <button key={value} className={`filter-button ${filter === value ? "filter-active" : ""}`} onClick={() => setFilter(value)}>{label}</button>)}</div><p className="mt-3 whitespace-pre-wrap text-sm text-blue-700" role="status">{message}</p><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{visible.map((person) => <div key={person.participantId} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"><strong>{person.name}</strong><span className={`text-xs font-bold ${person.status === "completed" ? "text-emerald-700" : "text-slate-500"}`}>{labels[person.status]}</span></div>)}</div>{!visible.length && <p className="py-5 text-sm text-slate-500">해당하는 참가자가 없습니다.</p>}</section><section className="surface-card"><h2 className="text-lg font-black">가볍게 안부를 물어봐 주세요</h2><p className="mt-2 text-sm leading-6 text-slate-500">최근 숙제 대상일에 2회 이상 연속 미제출한 참가자입니다. 주말·휴일·면제일은 건너뛰며, 오늘 마감 전 대기는 포함하지 않습니다.</p><div className="mt-4 flex flex-wrap gap-2">{needsHelp.map((person) => <span key={person.participantId} className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{person.name} · {person.recentMisses}회 미제출</span>)}</div>{!needsHelp.length && <p className="mt-4 text-sm text-emerald-700">현재 안부 확인 대상이 없습니다.</p>}<p className="mt-4 text-xs text-slate-400">이 목록은 운영진에게만 표시됩니다. 링크 수는 AI 사용량이 아닌 제출 기록의 지표입니다.</p></section></div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-white/80 p-3 sm:p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 text-xl font-black text-blue-900 sm:text-2xl">{value}</p></div>; }

type MissionRow = { id: number; mission_date: string; title: string; prompt: string };
export function MissionManager({ data }: { data: AdminData }) {
  const [rows, setRows] = useState<MissionRow[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const today = kstDateKey(new Date());
  const [date, setDate] = useState(today);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const challenge = data.challenge;
  useEffect(() => {
    if (!challenge) return;
    const controller = new AbortController();
    fetch(`/api/admin/missions?challengeId=${challenge.id}`, { cache: "no-store", signal: controller.signal }).then(async (r) => { if (!r.ok) throw new Error("미션을 불러오지 못했습니다."); setRows(await r.json()); }).catch((error) => { if (error.name !== "AbortError") setMessage(error.message); });
    return () => controller.abort();
  }, [challenge, revision]);
  if (!challenge) return null;
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/missions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: challenge!.id, date, title, prompt }) });
      const result = await response.json() as { error?: string; demo?: boolean };
      if (!response.ok) throw new Error(result.error);
      setMessage(result.demo ? "체험 모드에서는 저장되지 않습니다." : "미션을 예약했습니다. 해당 날짜에 자동으로 표시됩니다.");
      if (!result.demo) { setTitle(""); setPrompt(""); setRevision((v) => v + 1); }
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function remove(row: MissionRow) {
    if (!confirm(`${row.mission_date} 미션을 삭제할까요? 해당 날짜에는 기본 미션이 표시됩니다.`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/missions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, challengeId: challenge!.id }) });
      const result = await response.json() as { error?: string; demo?: boolean };
      if (!response.ok) throw new Error(result.error);
      setRevision((v) => v + 1); setMessage("예약 미션을 삭제했습니다.");
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <section className="surface-card"><div className="flex items-center gap-2"><Sparkles size={20} className="text-blue-600" /><h2 className="text-lg font-black">3분 미션 등록·예약</h2></div><p className="mt-2 text-sm leading-6 text-slate-500">필수 과제가 아닌 시작 도우미입니다. 미등록 날짜에는 기본 미션이 자동 제공됩니다. 여러 날짜를 차례로 등록해 한 주를 준비하세요.</p><form className="mt-5 grid gap-3" onSubmit={(event) => void save(event)}><label className="text-sm font-bold">표시 날짜<input className="form-input mt-1" type="date" value={date} min={challenge.startDate} max={challenge.endDate} onChange={(e) => setDate(e.target.value)} required /></label><button className="filter-button justify-self-start" type="button" onClick={() => { const sample = starterMission(date); setTitle(sample.title); setPrompt(sample.prompt); }}>기본 예시 불러오기</button><label className="text-sm font-bold">미션 제목<input className="form-input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="예: 오늘 보낼 메시지 다듬기" /></label><label className="text-sm font-bold">복사할 시작 프롬프트<textarea className="form-input mt-1 min-h-32" value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={3000} required /></label><button className="primary-button" disabled={busy}><Plus size={17} />{busy ? "처리 중…" : "선택한 날짜에 예약"}</button></form><p className="mt-3 text-sm text-blue-700" role="status">{message}</p><div className="mt-5 grid gap-2">{rows.map((row) => <details className="rounded-xl border border-slate-200 p-3" key={row.id}><summary className="cursor-pointer text-sm font-bold">{row.mission_date} · {row.title}</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{row.prompt}</p><button className="filter-button mt-3 text-rose-700" disabled={busy} onClick={() => void remove(row)}><Trash2 size={14} />삭제</button></details>)}</div></section>;
}

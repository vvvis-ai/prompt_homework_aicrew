"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Bell, Check, Copy, Sparkles } from "lucide-react";
import { starterMission, type DailyMission, type HabitDay } from "@/lib/habits";
import type { AppData } from "@/lib/types";
import { kstDateKey } from "@/lib/time";

export function WeekRecord({ days }: { days: HabitDay[] }) {
  const completed = days.filter((day) => day.status === "completed").length;
  const target = days.filter((day) => ["completed", "missed", "pending"].includes(day.status)).length;
  return <section className="surface-card week-record"><div className="flex items-end justify-between gap-3"><div><p className="habit-eyebrow">매일 조금씩</p><h2 className="mt-1 text-xl font-black">이번 주의 작은 실천</h2></div><p className="text-3xl font-black text-blue-700">{completed}<span className="text-sm font-semibold text-slate-500"> / {target}일</span></p></div><div className="week-strip mt-5">{days.map((day, index) => <div className={`week-dot week-${day.status}`} key={day.date} title={`${day.date} · ${{ completed: "제출 완료", pending: "오늘 도전", missed: "다시 시작해요", excluded: "쉬는 날", exempt: "면제", future: "예정", not_enrolled: "대상 아님" }[day.status]}`}><span>{["월", "화", "수", "목", "금", "토", "일"][index]}</span><strong>{day.status === "completed" ? <Check size={20} aria-label="제출 완료" /> : Number(day.date.slice(-2))}</strong></div>)}</div><p className="mt-4 text-sm leading-6 text-slate-500">오늘까지의 숙제 대상일 기준이에요. 하루 빠져도 쌓아온 실천은 사라지지 않아요.</p></section>;
}

export function MissionCard({ data, onSubmit }: { data: AppData; onSubmit: () => void }) {
  const today = kstDateKey(data.now);
  const [mission, setMission] = useState<DailyMission>(starterMission(today));
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/missions", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (response.ok) setMission(await response.json());
    }).catch(() => {});
    return () => controller.abort();
  }, [today]);
  async function copy() {
    try { await navigator.clipboard.writeText(mission.prompt); setMessage("복사했어요. 사용하는 AI에 붙여넣어 보세요."); }
    catch { setMessage("아래 프롬프트를 길게 누르거나 선택해 복사해주세요."); }
  }
  return <section className="mission-card"><div className="flex items-center justify-between gap-3"><span className="mission-pill"><Sparkles size={15} />오늘의 3분 미션</span><span className="text-xs font-bold text-blue-100">선택 미션 · 자유 주제도 OK</span></div><h2 className="mt-5 text-2xl font-black tracking-tight">{data.habit.recentMisses > 0 && data.todayStatus === "pending" ? "오늘 다시, 가볍게 시작해요" : "오늘은 AI로 뭘 해볼까요?"}</h2><p className="mt-2 text-blue-100">{mission.title}</p><p className="mission-prompt mt-4">{mission.prompt}</p><div className="mt-4 flex flex-wrap gap-2"><button className="white-button" type="button" onClick={() => void copy()}><Copy size={17} />시작 프롬프트 복사</button><button className="mission-submit" type="button" onClick={onSubmit}>써봤어요, 링크 남기기<ArrowRight size={17} /></button></div><p className="mt-3 text-xs leading-5 text-blue-100" role="status">{message || "결과가 완벽하지 않아도 괜찮아요. 직접 써본 경험이 오늘의 목표예요."}</p></section>;
}

type SavedReminder = { id: string; token: string; participantId: string; time: string };
export function ReminderCard({ participantId, demo }: { participantId: string; demo: boolean }) {
  const [time, setTime] = useState("21:00");
  const [saved, setSaved] = useState<SavedReminder | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      try { const item = JSON.parse(localStorage.getItem("aicrew_reminder") || "null") as SavedReminder | null; setSaved(item); if (item) setTime(item.time); } catch { /* Optional device storage. */ }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  async function save() {
    setBusy(true); setMessage("");
    try {
      if (demo) throw new Error("체험 모드에서는 알림을 등록하지 않습니다.");
      if (!/^(0[8-9]|1[0-9]|2[0-2]):(00|15|30|45)$/.test(time)) throw new Error("08:00~22:45 사이에서 15분 단위로 선택해주세요.");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("이 브라우저는 알림을 지원하지 않습니다. iPhone은 Safari에서 홈 화면에 추가한 뒤 열어주세요.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("브라우저 사이트 설정에서 알림을 허용해주세요.");
      const config = await fetch("/api/reminders").then((r) => r.json()) as { publicKey?: string };
      if (!config.publicKey) throw new Error("알림 서비스를 준비 중입니다.");
      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      const key = Uint8Array.from(atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const previous = saved ?? JSON.parse(localStorage.getItem("aicrew_reminder") || "null") as SavedReminder | null;
      const next = { id: previous?.id ?? crypto.randomUUID(), token: previous?.token ?? crypto.randomUUID(), participantId, time };
      // Persist the capability first so a network interruption never strands a subscription.
      localStorage.setItem("aicrew_reminder", JSON.stringify(next));
      const response = await fetch("/api/reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...next, endpoint: subscription.endpoint }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "알림 설정을 저장하지 못했습니다.");
      setSaved(next); setMessage("저장했어요. 미제출인 숙제 대상일에만 하루 한 번 알려드려요.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "알림 설정에 실패했습니다."); }
    finally { setBusy(false); }
  }
  async function disable() {
    if (!saved) return;
    setBusy(true);
    try {
      const response = await fetch("/api/reminders", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(saved) });
      if (!response.ok) throw new Error("해제하지 못했습니다. 다시 시도해주세요.");
      localStorage.removeItem("aicrew_reminder"); setSaved(null); setMessage("이 기기의 알림을 껐어요.");
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <section className="surface-card"><div className="flex items-center gap-2"><Bell size={19} className="text-blue-600" /><h2 className="font-black">잊지 않도록, 하루 한 번</h2></div><p className="mt-2 text-sm leading-6 text-slate-500">선택한 시간(한국 시간)에 이 기기로 알림을 받아요. 제출 완료·휴일·면제일에는 보내지 않아요.</p><div className="mt-4 flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="reminder-time">알림 시간</label><input id="reminder-time" className="date-input" type="time" min="08:00" max="22:45" step="900" value={time} onChange={(e) => setTime(e.target.value)} /><button className="filter-button" disabled={busy} onClick={() => void save()}>{busy ? "처리 중…" : saved?.participantId === participantId ? "알림 설정 저장" : "이 이름으로 알림 켜기"}</button>{saved && <button className="filter-button" disabled={busy} onClick={() => void disable()}>알림 끄기</button>}</div><p className="mt-3 text-xs leading-5 text-slate-500" role="status">{message || (saved?.participantId === participantId ? `알림 켜짐 · ${saved.time}` : saved ? "이 기기에 다른 이름의 알림이 설정되어 있어요. 켜기를 누르면 현재 이름으로 바뀝니다." : "알림은 선택사항이에요. iPhone은 홈 화면에 추가 후 이용해주세요.")}</p></section>;
}

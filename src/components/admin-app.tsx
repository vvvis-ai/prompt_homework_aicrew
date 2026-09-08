"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Award,
  CalendarDays,
  Check,
  ClipboardList,
  Download,
  FileClock,
  LayoutDashboard,
  Link2,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { AdminData, AdminParticipant, DailyStatus, Submission } from "@/lib/types";
import { HabitOverview, MissionManager } from "./habit-admin";

type Gate = "loading" | "login" | "operator" | "ready";
type Tab = "overview" | "participants" | "matrix" | "submissions" | "settings" | "audit";
type OperatorChoice = { id: string; name: string; isActive: boolean };

const labels: Record<DailyStatus, string> = {
  completed: "완료",
  pending: "대기",
  missed: "미완료",
  exempt: "면제",
  excluded: "제외",
  future: "예정",
  not_enrolled: "미참여",
};

const tones: Record<DailyStatus, string> = {
  completed: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-800",
  missed: "bg-rose-100 text-rose-700",
  exempt: "bg-blue-100 text-blue-700",
  excluded: "bg-slate-100 text-slate-500",
  future: "bg-slate-50 text-slate-400",
  not_enrolled: "bg-slate-50 text-slate-300",
};

function won(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value) + "원";
}

function ErrorMessage({ message }: { message: string }) {
  return message ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{message}</p> : null;
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  return <button className="primary-button !min-h-11 sm:!w-auto" type="submit"><Plus size={17} />{children}</button>;
}

async function readApiJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const body = await response.text();
  if (!body) return {} as T;
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(fallbackMessage);
  }
}

export function AdminApp() {
  const [gate, setGate] = useState<Gate>("loading");
  const [data, setData] = useState<AdminData | null>(null);
  const [operators, setOperators] = useState<OperatorChoice[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [month, setMonth] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (nextMonth?: string, nextChallengeId?: string) => {
    setBusy(true);
    setMessage("");
    try {
      const params = new URLSearchParams();
      if (nextMonth || month) params.set("month", nextMonth || month);
      if (nextChallengeId || challengeId) params.set("challengeId", nextChallengeId || challengeId);
      const response = await fetch(`/api/admin/data?${params}`, { cache: "no-store" });
      if (response.status === 401) {
        setGate("login");
        setData(null);
        return;
      }
      const payload = await readApiJson<Partial<AdminData> & { error?: string }>(
        response,
        "관리자 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.",
      );
      if (!response.ok) throw new Error(payload.error || "관리자 데이터를 불러오지 못했습니다.");
      if (!payload.challenge && payload.operators && !payload.participants) {
        setOperators(payload.operators);
        setGate("operator");
        return;
      }
      const adminData = payload as AdminData;
      setData(adminData);
      setMonth(adminData.month);
      setChallengeId(adminData.challenge?.id ?? "");
      setOperators(adminData.operators ?? []);
      setGate("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "오류가 발생했습니다.");
      if (gate === "loading") setGate("login");
    } finally {
      setBusy(false);
    }
  }, [challengeId, gate, month]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function mutate(path: string, method: "POST" | "PATCH" | "DELETE", body: unknown, success: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await readApiJson<{ error?: string; demo?: boolean }>(
        response,
        "서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.",
      );
      if (!response.ok) throw new Error(payload.error || "요청을 처리하지 못했습니다.");
      setMessage(payload.demo ? `${success} (체험 모드라 실제 저장되지는 않습니다.)` : success);
      await load();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "오류가 발생했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: form.get("password") }) });
      const payload = await readApiJson<{ error?: string }>(
        response,
        "로그인 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.",
      );
      if (!response.ok) throw new Error(payload.error || "로그인하지 못했습니다.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인하지 못했습니다.");
    } finally { setBusy(false); }
  }

  async function chooseOperator(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/select-operator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operatorId: id }) });
      const payload = await readApiJson<{ error?: string }>(
        response,
        "운영자 선택 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.",
      );
      if (!response.ok) throw new Error(payload.error || "운영자를 선택하지 못했습니다.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "운영자를 선택하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setData(null);
    setGate("login");
  }

  if (gate === "loading") return <CenteredCard><RefreshCw className="animate-spin text-blue-600" /><p className="font-bold text-slate-600">관리자 화면을 준비하고 있어요.</p></CenteredCard>;
  if (gate === "login") return <LoginGate onSubmit={login} busy={busy} message={message} />;
  if (gate === "operator") return <OperatorGate operators={operators} choose={chooseOperator} busy={busy} message={message} />;
  if (!data) return null;

  const nav: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "overview", label: "현황", icon: <LayoutDashboard size={18} /> },
    { id: "participants", label: "참가자", icon: <Users size={18} /> },
    { id: "matrix", label: "달력", icon: <CalendarDays size={18} /> },
    { id: "submissions", label: "프롬프트", icon: <ClipboardList size={18} /> },
    { id: "settings", label: "운영 설정", icon: <Settings size={18} /> },
    { id: "audit", label: "변경 기록", icon: <FileClock size={18} /> },
  ];

  return (
    <main className="min-h-screen pb-24 lg:pb-8">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:grid lg:grid-cols-[230px_1fr] lg:gap-6">
        <aside className="surface-card mb-5 hidden h-fit !p-4 lg:block lg:sticky lg:top-5">
          <div className="mb-5 flex items-center gap-3 px-2"><div className="brand-mark">AI</div><div><p className="font-black">러닝크루 운영실</p><p className="text-xs text-slate-500">{data.session.operatorName}</p></div></div>
          <nav className="grid gap-1">{nav.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`nav-button ${tab === item.id ? "nav-active" : ""}`}>{item.icon}{item.label}</button>)}</nav>
          <Link href="/" className="secondary-button mt-4"><ArrowLeft size={17} />참가자 화면</Link>
          <button onClick={logout} className="secondary-button mt-2"><LogOut size={17} />로그아웃</button>
        </aside>

        <section className="min-w-0">
          <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-sm font-extrabold text-blue-600">ADMIN CONSOLE</p><h1 className="text-2xl font-black tracking-tight sm:text-3xl">{data.challenge?.name ?? "기수 준비"}</h1></div>
            <div className="flex flex-wrap gap-2">
              <select aria-label="기수 선택" className="date-input" value={challengeId} onChange={(event) => { setChallengeId(event.target.value); void load(month, event.target.value); }}>
                {data.challenges.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isActive ? " · 운영 중" : ""}</option>)}
              </select>
              <input aria-label="조회 월" className="date-input" type="month" value={month} onChange={(event) => { setMonth(event.target.value); void load(event.target.value, challengeId); }} />
              <button className="icon-button" aria-label="새로고침" onClick={() => void load()} disabled={busy}><RefreshCw size={18} className={busy ? "animate-spin" : ""} /></button>
            </div>
          </header>
          {data.demo && <div className="mb-4 rounded-xl bg-amber-100 px-4 py-3 text-sm font-bold text-amber-900">체험 모드입니다. 화면과 계산은 확인할 수 있지만 변경 내용은 저장되지 않습니다.</div>}
          <ErrorMessage message={message} />
          <div className="mt-4">
            {tab === "overview" && <><HabitOverview data={data} /><details className="mt-5"><summary className="cursor-pointer p-3 text-sm font-bold text-slate-500">조회 월 상세 통계·정산 보기</summary><Overview data={data} /></details></>}
            {tab === "participants" && <Participants data={data} mutate={mutate} />}
            {tab === "matrix" && <Matrix data={data} />}
            {tab === "submissions" && <Submissions data={data} mutate={mutate} />}
            {tab === "settings" && <div className="grid gap-5"><MissionManager key={data.challenge?.id} data={data} /><SettingsPanel data={data} mutate={mutate} /></div>}
            {tab === "audit" && <Audit data={data} />}
          </div>
        </section>
      </div>
      <nav className="mobile-nav !grid-cols-6 lg:!hidden">{nav.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`nav-button !min-h-12 !px-1 ${tab === item.id ? "nav-active" : ""}`} aria-label={item.label}>{item.icon}<span className="sr-only">{item.label}</span></button>)}</nav>
    </main>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-screen place-items-center p-5"><section className="surface-card flex w-full max-w-md flex-col items-center gap-4 text-center">{children}</section></main>;
}

function LoginGate({ onSubmit, busy, message }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean; message: string }) {
  return <CenteredCard><div className="brand-mark">AI</div><div><h1 className="text-2xl font-black">운영자 로그인</h1><p className="mt-2 text-sm text-slate-500">관리자 비밀번호는 서버에서만 확인합니다.</p></div><form className="grid w-full gap-3" onSubmit={onSubmit}><input className="form-input" name="password" type="password" autoComplete="current-password" placeholder="관리자 비밀번호" required /><button className="primary-button" disabled={busy}><ShieldCheck size={18} />{busy ? "확인 중…" : "운영실 입장"}</button></form><ErrorMessage message={message} /><Link className="text-sm font-bold text-blue-600" href="/">참가자 화면으로 돌아가기</Link></CenteredCard>;
}

function OperatorGate({ operators, choose, busy, message }: { operators: OperatorChoice[]; choose: (id: string) => void; busy: boolean; message: string }) {
  return <CenteredCard><Award size={34} className="text-blue-600" /><div><h1 className="text-2xl font-black">오늘의 운영자를 선택해 주세요</h1><p className="mt-2 text-sm text-slate-500">모든 변경 사항에 선택한 이름이 기록됩니다.</p></div><div className="grid w-full gap-2">{operators.map((operator) => <button className="participant-button" disabled={busy} key={operator.id} onClick={() => void choose(operator.id)}><span className="avatar">{operator.name.slice(0, 1)}</span><strong>{operator.name}</strong></button>)}</div><ErrorMessage message={message} /></CenteredCard>;
}

function Overview({ data }: { data: AdminData }) {
  const cards = [
    ["참가자", data.metrics.totalParticipants, "명"], ["오늘 완료", data.metrics.todayCompleted, "명"], ["오늘 대기", data.metrics.todayPending, "명"], ["오늘 미완료", data.metrics.todayMissed, "명"], ["이달 링크", data.metrics.monthLinks, "개"], ["이달 벌금", data.metrics.monthPenalty, "원"],
  ];
  return <div className="grid gap-5"><div className="grid grid-cols-2 gap-3 xl:grid-cols-6">{cards.map(([label, value, unit]) => <article className="stat-card" key={String(label)}><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{typeof value === "number" ? new Intl.NumberFormat("ko-KR").format(value) : value}<span className="ml-1 text-sm text-slate-500">{unit}</span></p></article>)}</div><section className="surface-card"><h2 className="text-lg font-black">오늘 제출 현황</h2><div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{data.today.map((item) => <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3" key={item.participantId}><strong>{item.name}</strong><div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-500">링크 {item.linkCount}</span><span className={`rounded-full px-2.5 py-1 text-xs font-black ${tones[item.status]}`}>{labels[item.status]}</span></div></div>)}</div></section></div>;
}

function Participants({ data, mutate }: { data: AdminData; mutate: (path: string, method: "POST" | "PATCH" | "DELETE", body: unknown, success: string) => Promise<boolean> }) {
  const challenge = data.challenge;
  const [editing, setEditing] = useState<AdminParticipant | null>(null);
  const [saving, setSaving] = useState(false);
  if (!challenge) return <Empty text="먼저 기수를 만들어 주세요." />;
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element);
    const ok = await mutate("/api/admin/participants", "POST", { challengeId: challenge!.id, name: form.get("name"), affiliation: form.get("affiliation"), joinedAt: form.get("joinedAt"), paidAmount: Number(form.get("paidAmount")) }, "참가자를 추가했습니다.");
    if (ok) element.reset();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const ok = await mutate(`/api/admin/participants/${editing.id}`, "PATCH", {
      challengeId: challenge!.id,
      name: form.get("name"),
      affiliation: form.get("affiliation"),
      joinedAt: form.get("joinedAt"),
      leftAt: form.get("leftAt") || null,
      paidAmount: Number(form.get("paidAmount")),
      isActive: editing.isActive,
    }, "참가자 정보를 수정했습니다.");
    setSaving(false);
    if (ok) setEditing(null);
  }
  async function remove(person: AdminParticipant) {
    if (!window.confirm(`${person.name} 참가자를 삭제할까요?\n\n제출 또는 면제 기록이 있는 참가자는 삭제되지 않으며, 퇴장일 입력을 이용해야 합니다.`)) return;
    setSaving(true);
    const ok = await mutate(`/api/admin/participants/${person.id}`, "DELETE", { challengeId: challenge!.id, confirm: "DELETE" }, "참가자를 삭제했습니다.");
    setSaving(false);
    if (ok) setEditing(null);
  }
  async function toggle(person: AdminParticipant) {
    if (!window.confirm(`${person.name} 참가자를 ${person.isActive ? "비활성화" : "활성화"}할까요? 기존 기록은 보존됩니다.`)) return;
    await mutate(`/api/admin/participants/${person.id}`, "PATCH", { challengeId: challenge!.id, name: person.name, joinedAt: person.joinedAt, leftAt: person.leftAt, paidAmount: person.paidAmount, isActive: !person.isActive }, "참가 상태를 변경했습니다.");
  }
  return <div className="grid gap-5">
    <form onSubmit={add} className="surface-card grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><input className="form-input" name="name" placeholder="참가자 이름" required /><label className="grid gap-1 text-sm font-bold">소속 (선택)<input className="form-input" name="affiliation" maxLength={120} /></label><input className="form-input" name="joinedAt" type="date" defaultValue={challenge.startDate} required /><input className="form-input" name="paidAmount" type="number" min="0" defaultValue={challenge.defaultFee} required /><SubmitButton>참가자 추가</SubmitButton></form>
    <section className="surface-card !p-0 overflow-hidden"><div className="overflow-x-auto"><table className="min-w-[900px] w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr>{["이름", "참여 기간", "완료", "미완료", "링크", "납부", "벌금", "환급액 / 상태", "관리"].map((item) => <th className="px-4 py-3" key={item}>{item}</th>)}</tr></thead><tbody>{data.participants.map((person) => <tr className={`border-t border-slate-100 ${person.isActive ? "" : "opacity-50"}`} key={person.id}><td className="px-4 py-3 font-black">{person.name}</td><td className="px-4 py-3">{person.joinedAt} ~ {person.leftAt ?? "참여 중"}</td><td className="px-4 py-3 text-emerald-700 font-bold">{person.completedDays}</td><td className="px-4 py-3 text-rose-700 font-bold">{person.missedDays}</td><td className="px-4 py-3">{person.totalLinks}</td><td className="px-4 py-3">{won(person.paidAmount)}</td><td className="px-4 py-3">{won(person.penaltyAmount)}</td><td className="px-4 py-3 font-black">{won(person.refundedAmount ?? person.expectedRefund)}<span className={`mt-1 block text-xs ${person.refundedAmount !== null ? "text-emerald-700" : "text-slate-500"}`}>{person.refundedAmount !== null ? "환급 완료" : "예상 환급"}</span></td><td className="px-4 py-3"><div className="flex gap-1"><button type="button" className="icon-button !h-9 !w-9" aria-label={`${person.name} 수정`} onClick={() => setEditing(person)}><Pencil size={15} /></button><button type="button" className="filter-button !min-h-9" onClick={() => void toggle(person)}>{person.isActive ? "비활성" : "활성"}</button></div></td></tr>)}</tbody></table></div></section>
    {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditing(null); }}>
      <section aria-labelledby="participant-edit-title" aria-modal="true" className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl" role="dialog">
        <div className="mb-5"><p className="text-xs font-black text-blue-600">참가자 관리</p><h2 className="mt-1 text-xl font-black" id="participant-edit-title">{editing.name} 정보 수정</h2></div>
        <form className="grid gap-4" onSubmit={save}>
          <label className="grid gap-1.5 text-sm font-bold">이름<input className="form-input" name="name" defaultValue={editing.name} maxLength={60} required /></label>
          <label className="grid gap-1.5 text-sm font-bold">소속 (선택)<input className="form-input" name="affiliation" defaultValue={editing.affiliation} maxLength={120} /><span className="text-xs font-normal text-slate-500">입력하면 참가자 명단에 이름과 함께 표시됩니다.</span></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-bold">참여일 (YYYY-MM-DD)<input className="form-input" name="joinedAt" type="date" defaultValue={editing.joinedAt} required /></label>
            <label className="grid gap-1.5 text-sm font-bold">퇴장일 (YYYY-MM-DD)<input className="form-input" name="leftAt" type="date" defaultValue={editing.leftAt ?? ""} min={editing.joinedAt} /><span className="text-xs font-normal text-slate-500">참여 중이면 비워 두세요.</span></label>
          </div>
          <label className="grid gap-1.5 text-sm font-bold">실제 납부액<input className="form-input" name="paidAmount" type="number" min="0" defaultValue={editing.paidAmount} required /></label>
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <button type="button" className="filter-button !border-rose-200 !text-rose-700" disabled={saving} onClick={() => void remove(editing)}><Trash2 size={16} />참가자 삭제</button>
            <div className="flex gap-2"><button type="button" className="filter-button" disabled={saving} onClick={() => setEditing(null)}>취소</button><button type="submit" className="primary-button !w-auto" disabled={saving}>{saving ? "저장 중..." : "저장"}</button></div>
          </div>
        </form>
      </section>
    </div>}
  </div>;
}

function Matrix({ data }: { data: AdminData }) {
  const days = useMemo(() => data.matrix[0] ? Object.keys(data.matrix[0].days) : [], [data.matrix]);
  return <section className="surface-card !p-0 overflow-hidden"><div className="border-b border-slate-100 p-5"><h2 className="text-lg font-black">월간 달력 매트릭스</h2><p className="mt-1 text-sm text-slate-500">제출 시각은 한국 시간 기준이며, 면제·휴일은 벌금과 연속 달성 계산에서 제외됩니다.</p></div><div className="overflow-x-auto"><table className="min-w-max text-xs"><thead><tr className="bg-slate-50"><th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left">참가자</th>{days.map((day) => <th className="px-2 py-3" key={day}>{Number(day.slice(-2))}</th>)}</tr></thead><tbody>{data.matrix.map((row) => <tr className="border-t border-slate-100" key={row.participantId}><th className="sticky left-0 z-10 bg-white px-4 py-3 text-left font-black">{row.name}</th>{days.map((day) => <td className="px-1 py-2 text-center" key={day}><span title={labels[row.days[day]]} className={`inline-grid h-7 w-7 place-items-center rounded-lg font-black ${tones[row.days[day]]}`}>{row.days[day] === "completed" ? "✓" : row.days[day] === "missed" ? "×" : row.days[day] === "exempt" ? "면" : "·"}</span></td>)}</tr>)}</tbody></table></div></section>;
}

function Submissions({ data, mutate }: { data: AdminData; mutate: (path: string, method: "POST" | "PATCH" | "DELETE", body: unknown, success: string) => Promise<boolean> }) {
  if (!data.challenge) return <Empty text="선택한 기수가 없습니다." />;
  async function edit(item: Submission) {
    const title = window.prompt("제목 (선택)", item.title ?? ""); if (title === null) return;
    const url = window.prompt("URL", item.url); if (!url) return;
    const description = window.prompt("설명 (선택)", item.description ?? ""); if (description === null) return;
    await mutate(`/api/admin/submissions/${item.id}`, "PATCH", { challengeId: data.challenge!.id, title: title || null, url, description: description || null }, "제출물을 수정했습니다. 최초 제출 시각은 그대로 보존됩니다.");
  }
  async function remove(item: Submission) {
    if (!window.confirm(`${item.participantName}님의 제출물을 삭제할까요? 이 작업은 변경 기록에 남습니다.`)) return;
    await mutate(`/api/admin/submissions/${item.id}`, "DELETE", { challengeId: data.challenge!.id, confirm: "DELETE" }, "제출물을 삭제했습니다.");
  }
  return <section className="grid gap-3">{data.submissions.map((item) => <article className="feed-card" key={item.id}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className="avatar-mini">{item.participantName.slice(0, 1)}</span><strong>{item.participantName}</strong>{item.isFeatured && <span className="featured-badge">추천</span>}</div><h3 className="mt-3 font-black">{item.title || "제목 없는 프롬프트"}</h3><a className="link-chip mt-2" href={item.url} target="_blank" rel="noreferrer"><Link2 size={15} /><span>{item.url}</span></a><p className="mt-2 text-sm text-slate-600">{item.description}</p><time className="mt-3 block text-xs font-bold text-slate-400">{new Date(item.submittedAt).toLocaleString("ko-KR")}</time></div><div className="flex gap-1"><button className="icon-button" title="수정" onClick={() => void edit(item)}><Pencil size={16} /></button><button className={`icon-button ${item.isFeatured ? "!bg-amber-100 !text-amber-700" : ""}`} title="추천" onClick={() => void mutate(`/api/admin/submissions/${item.id}/featured`, "PATCH", { challengeId: data.challenge!.id, isFeatured: !item.isFeatured }, item.isFeatured ? "추천을 해제했습니다." : "추천 프롬프트로 표시했습니다.")}><Star size={16} fill={item.isFeatured ? "currentColor" : "none"} /></button><button className="icon-button !text-rose-600" title="삭제" onClick={() => void remove(item)}><Trash2 size={16} /></button></div></div></article>)}{data.submissions.length === 0 && <Empty text="이 기수의 제출물이 없습니다." />}</section>;
}

function SettingsPanel({ data, mutate }: { data: AdminData; mutate: (path: string, method: "POST" | "PATCH" | "DELETE", body: unknown, success: string) => Promise<boolean> }) {
  const challenge = data.challenge;
  async function submitForm(event: FormEvent<HTMLFormElement>, path: string, build: (form: FormData) => unknown, success: string) { event.preventDefault(); const ok = await mutate(path, "POST", build(new FormData(event.currentTarget)), success); if (ok) event.currentTarget.reset(); }
  async function editChallenge() {
    if (!challenge) return;
    const name = window.prompt("기수 이름", challenge.name); if (!name) return;
    const startDate = window.prompt("시작일 (YYYY-MM-DD)", challenge.startDate); if (!startDate) return;
    const endDate = window.prompt("종료일 (YYYY-MM-DD)", challenge.endDate); if (!endDate) return;
    const defaultFee = window.prompt("기본 참가비", String(challenge.defaultFee)); if (defaultFee === null) return;
    const defaultPenalty = window.prompt("기본 1일 차감액", String(challenge.defaultPenalty)); if (defaultPenalty === null) return;
    await mutate(`/api/admin/challenges/${challenge.id}`, "PATCH", { name, startDate, endDate, defaultFee: Number(defaultFee), defaultPenalty: Number(defaultPenalty) }, "기수 정보를 수정했습니다.");
  }
  async function deleteChallenge() {
    if (!challenge || challenge.isActive) return;
    const confirmation = window.prompt(`'${challenge.name}' 기수를 삭제하려면 기수 이름을 입력하세요. 참가자나 제출물 등 운영 데이터가 있는 기수는 삭제할 수 없습니다.`);
    if (confirmation === null) return;
    if (confirmation.trim() !== challenge.name) {
      window.alert("기수 이름이 일치하지 않아 삭제하지 않았습니다.");
      return;
    }
    await mutate(`/api/admin/challenges/${challenge.id}`, "DELETE", { confirm: "DELETE", challengeName: confirmation.trim() }, "기수를 삭제했습니다.");
  }
  async function editNotice(item: AdminData["notices"][number]) {
    if (!challenge) return;
    const title = window.prompt("공지 제목", item.title); if (!title) return;
    const content = window.prompt("공지 내용", item.content); if (!content) return;
    const isPinned = window.confirm("이 공지를 상단에 고정할까요?");
    await mutate(`/api/admin/notices/${item.id}`, "PATCH", { challengeId: challenge.id, title, content, isPinned }, "공지를 수정했습니다.");
  }
  return <div className="grid gap-5 xl:grid-cols-2">
    <SettingCard title="기수 만들기" description="새 기수는 생성 후 ‘운영 기수로 전환’을 눌러야 참가자 화면에 표시됩니다. 비활성 상태이며 운영 데이터가 없는 기수만 삭제할 수 있습니다."><form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submitForm(event, "/api/admin/challenges", (f) => ({ name: f.get("name"), startDate: f.get("startDate"), endDate: f.get("endDate"), defaultFee: Number(f.get("defaultFee")), defaultPenalty: Number(f.get("defaultPenalty")) }), "기수를 만들었습니다.")}><input className="form-input sm:col-span-2" name="name" placeholder="기수 이름" required /><input className="form-input" type="date" name="startDate" required /><input className="form-input" type="date" name="endDate" required /><input className="form-input" type="number" min="0" name="defaultFee" defaultValue="80000" placeholder="기본 회비" required /><input className="form-input" type="number" min="0" name="defaultPenalty" defaultValue="2000" placeholder="기본 벌금" required /><div className="sm:col-span-2"><SubmitButton>기수 만들기</SubmitButton></div></form>{challenge && <div className="mt-3 grid gap-2 sm:grid-cols-2"><button className="secondary-button" onClick={() => void editChallenge()}><Pencil size={17} />현재 기수 수정</button>{!challenge.isActive && <><button className="secondary-button" onClick={() => { if (window.confirm(`${challenge.name}을 운영 기수로 전환할까요?`)) void mutate(`/api/admin/challenges/${challenge.id}/activate`, "POST", {}, "운영 기수를 전환했습니다."); }}><Check size={17} />운영 기수로 전환</button><button className="secondary-button !text-rose-600 sm:col-span-2" onClick={() => void deleteChallenge()}><Trash2 size={17} />현재 기수 삭제</button></>}</div>}</SettingCard>
    <SettingCard title="운영자 추가" description="변경 기록에 표시할 운영자 이름입니다."><form className="flex gap-2" onSubmit={(event) => void submitForm(event, "/api/admin/operators", (f) => ({ name: f.get("name") }), "운영자를 추가했습니다.")}><input className="form-input" name="name" placeholder="운영자 이름" required /><SubmitButton>추가</SubmitButton></form><div className="mt-3 flex flex-wrap gap-2">{data.operators.map((operator) => <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold" key={operator.id}>{operator.name}</span>)}</div></SettingCard>
    {challenge && <>
      <SettingCard title="면제일" description="해당 참가자의 미완료·벌금·연속 달성 계산에서 제외합니다."><form className="grid gap-2 sm:grid-cols-2" onSubmit={(event) => void submitForm(event, "/api/admin/exemptions", (f) => ({ challengeId: challenge.id, participantId: f.get("participantId"), date: f.get("date"), reason: f.get("reason") }), "면제일을 등록했습니다.")}><select className="form-input" name="participantId" required><option value="">참가자 선택</option>{data.participants.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select><input className="form-input" type="date" name="date" required /><input className="form-input sm:col-span-2" name="reason" placeholder="면제 사유" required /><div className="sm:col-span-2"><SubmitButton>면제 등록</SubmitButton></div></form><RecordList items={data.exemptions.map((item) => ({ id: item.id, text: `${item.date} · ${item.participantName} · ${item.reason}` }))} remove={(id) => mutate(`/api/admin/exemptions/${id}`, "DELETE", { challengeId: challenge.id, confirm: "DELETE" }, "면제 기록을 삭제했습니다.")} /></SettingCard>
      <SettingCard title="운영 제외일" description="주말·공휴일 외에 운영상 과제 대상에서 뺄 날짜를 등록합니다."><form className="grid gap-2" onSubmit={(event) => void submitForm(event, "/api/admin/excluded-dates", (f) => ({ challengeId: challenge.id, date: f.get("date"), reason: f.get("reason") }), "제외일을 등록했습니다.")}><input className="form-input" type="date" name="date" required /><input className="form-input" name="reason" placeholder="제외 사유" required /><SubmitButton>제외일 등록</SubmitButton></form><RecordList items={data.excludedDates.map((item) => ({ id: item.id, text: `${item.date} · ${item.reason}${item.source === "holiday" ? " (공휴일)" : ""}`, locked: item.source === "holiday" }))} remove={(id) => mutate(`/api/admin/excluded-dates/${id}`, "DELETE", { challengeId: challenge.id, confirm: "DELETE" }, "제외일을 삭제했습니다.")} /></SettingCard>
      <SettingCard title="벌금 변경" description="적용일 이후의 미완료 날짜부터 새 금액이 적용됩니다. 기존 내역은 보존됩니다."><form className="grid gap-2 sm:grid-cols-2" onSubmit={(event) => void submitForm(event, "/api/admin/penalty-rates", (f) => ({ challengeId: challenge.id, amount: Number(f.get("amount")), effectiveFrom: f.get("effectiveFrom") }), "벌금 규칙을 추가했습니다.")}><input className="form-input" type="number" min="0" name="amount" defaultValue={challenge.defaultPenalty} required /><input className="form-input" type="date" name="effectiveFrom" required /><div className="sm:col-span-2"><SubmitButton>적용 규칙 추가</SubmitButton></div></form><div className="mt-3 grid gap-2">{data.penaltyRates.map((item) => <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold" key={item.id}>{item.effectiveFrom}부터 {won(item.amount)}</div>)}</div></SettingCard>
      <SettingCard title="공지" description="고정 공지는 참가자 홈 상단에 먼저 보입니다."><form className="grid gap-2" onSubmit={(event) => void submitForm(event, "/api/admin/notices", (f) => ({ challengeId: challenge.id, title: f.get("title"), content: f.get("content"), isPinned: f.get("isPinned") === "on" }), "공지를 등록했습니다.")}><input className="form-input" name="title" placeholder="공지 제목" required /><textarea className="form-input min-h-28" name="content" placeholder="공지 내용" required /><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="isPinned" /> 상단에 고정</label><SubmitButton>공지 등록</SubmitButton></form><div className="mt-3 grid gap-2">{data.notices.map((item) => <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm" key={item.id}><span>{item.isPinned ? "📌 " : ""}{item.title}</span><div className="flex gap-1"><button className="icon-button !h-8 !w-8 !border-0 !bg-transparent" aria-label="공지 수정" onClick={() => void editNotice(item)}><Pencil size={15} /></button><button className="icon-button !h-8 !w-8 !border-0 !bg-transparent !text-rose-600" aria-label="공지 삭제" onClick={() => { if (window.confirm("이 공지를 삭제할까요?")) void mutate(`/api/admin/notices/${item.id}`, "DELETE", { challengeId: challenge.id, confirm: "DELETE" }, "공지를 삭제했습니다."); }}><Trash2 size={15} /></button></div></div>)}</div></SettingCard>
      <SettingCard title="정산 파일" description="현재 선택한 기수와 월의 정산표를 내려받습니다."><div className="grid gap-2 sm:grid-cols-2"><a className="secondary-button" href={`/api/admin/export?challengeId=${challenge.id}&month=${data.month}&format=csv`}><Download size={17} />CSV 받기</a><a className="secondary-button" href={`/api/admin/export?challengeId=${challenge.id}&month=${data.month}&format=xlsx`}><Download size={17} />엑셀 받기</a></div></SettingCard>
    </>}
  </div>;
}

function SettingCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="surface-card"><h2 className="text-lg font-black">{title}</h2><p className="mb-4 mt-1 text-sm text-slate-500">{description}</p>{children}</section>; }

function RecordList({ items, remove }: { items: Array<{ id: string; text: string; locked?: boolean }>; remove: (id: string) => Promise<boolean> }) { return <div className="mt-3 grid gap-2">{items.map((item) => <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm" key={item.id}><span>{item.text}</span>{!item.locked && <button className="icon-button !h-8 !w-8 !border-0 !bg-transparent !text-rose-600" aria-label="삭제" onClick={() => { if (window.confirm("이 기록을 삭제할까요?")) void remove(item.id); }}><Trash2 size={15} /></button>}</div>)}</div>; }

function Audit({ data }: { data: AdminData }) { return <section className="surface-card !p-0 overflow-hidden"><div className="p-5"><h2 className="text-lg font-black">변경 기록</h2><p className="mt-1 text-sm text-slate-500">누가, 언제, 어떤 항목을 변경했는지 최근 200건까지 표시합니다.</p></div><div className="overflow-x-auto"><table className="min-w-[700px] w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-4 py-3">일시</th><th className="px-4 py-3">운영자</th><th className="px-4 py-3">동작</th><th className="px-4 py-3">대상</th><th className="px-4 py-3">ID</th></tr></thead><tbody>{data.auditLogs.map((log) => <tr className="border-t border-slate-100" key={log.id}><td className="px-4 py-3">{new Date(log.createdAt).toLocaleString("ko-KR")}</td><td className="px-4 py-3 font-bold">{log.operatorName}</td><td className="px-4 py-3">{log.action}</td><td className="px-4 py-3">{log.entityType}</td><td className="px-4 py-3 text-slate-500">{log.entityId}</td></tr>)}</tbody></table></div>{data.auditLogs.length === 0 && <Empty text="아직 변경 기록이 없습니다." />}</section>; }

function Empty({ text }: { text: string }) { return <div className="surface-card py-12 text-center text-sm font-bold text-slate-500">{text}</div>; }

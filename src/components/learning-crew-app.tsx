"use client";

import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Flame,
  Home,
  Link2,
  LogOut,
  Megaphone,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { canParticipantEdit, formatKstTime, formatRemainingUntilCutoff, kstDateKey } from "@/lib/time";
import { daysUntil } from "@/lib/business";
import { getSubmissionUrlError } from "@/lib/url";
import type { AppData, CalendarDay, DailyStatus, Submission } from "@/lib/types";
import { MissionCard, ReminderCard, WeekRecord } from "./habit-cards";
import { ParticipantDirectory } from "./participant-directory";
import { ShareLinkHelp } from "./share-link-help";

type Tab = "home" | "submit" | "feed" | "growth";

const statusContent: Record<DailyStatus, { icon: string; title: string; detail: string; tone: string }> = {
  completed: { icon: "✅", title: "오늘도 AI를 써봤어요", detail: "오늘의 제출 완료! 작은 실천이 하나 더 쌓였어요.", tone: "status-completed" },
  pending: { icon: "🌱", title: "오늘, AI와 3분 어때요?", detail: "한 번 써보고 23:00까지 링크를 남겨주세요.", tone: "status-pending" },
  missed: { icon: "🌙", title: "오늘의 제출은 마감됐어요", detail: "오늘은 미제출로 기록됐어요. 다음 대상일에 다시 시작해요. 링크 공유는 계속할 수 있어요.", tone: "status-missed" },
  exempt: { icon: "🟦", title: "오늘은 면제일입니다", detail: "스트릭은 그대로 유지됩니다.", tone: "status-exempt" },
  excluded: { icon: "🎉", title: "오늘은 숙제 없는 날입니다", detail: "쉬어가도 좋고, AI 활용 사례를 공유해도 좋아요.", tone: "status-excluded" },
  future: { icon: "📅", title: "아직 오지 않은 날입니다", detail: "미래 날짜에는 상태를 표시하지 않습니다.", tone: "status-excluded" },
  not_enrolled: { icon: "👋", title: "숙제 대상 기간이 아닙니다", detail: "참여 기간을 확인해주세요.", tone: "status-excluded" },
};

const statusMark: Record<DailyStatus, string> = {
  completed: "✅",
  pending: "·",
  missed: "❌",
  exempt: "🟦",
  excluded: "",
  future: "",
  not_enrolled: "",
};

const statusLabel: Record<DailyStatus, string> = {
  completed: "제출 완료",
  pending: "오늘 도전",
  missed: "미제출",
  exempt: "면제",
  excluded: "숙제 없는 날",
  future: "예정",
  not_enrolled: "참여 기간 아님",
};

function addDate(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function shiftMonth(monthKey: string, amount: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function displayDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return `${year}.${month}.${day}`;
}

function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function challengeProgress(data: AppData) {
  if (!data.challenge) return 0;
  const start = new Date(`${data.challenge.startDate}T00:00:00Z`).getTime();
  const end = new Date(`${data.challenge.endDate}T23:59:59Z`).getTime();
  const now = new Date(data.now).getTime();
  return Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
}

export function LearningCrewApp({ initialData }: { initialData: AppData }) {
  const [data, setData] = useState(initialData);
  const [participantId, setParticipantId] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [feedDate, setFeedDate] = useState(kstDateKey(initialData.now));
  const [month, setMonth] = useState(initialData.month);
  const [search, setSearch] = useState("");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [receipt, setReceipt] = useState<{ onTime: boolean; url: string } | null>(null);
  const [remaining, setRemaining] = useState<string | null>(null);
  const [reminderSet, setReminderSet] = useState(true);
  const [editing, setEditing] = useState<Submission | null>(null);
  const [submissionUrlError, setSubmissionUrlError] = useState<string | null>(null);
  const [editUrlError, setEditUrlError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setRemaining(formatRemainingUntilCutoff(new Date()));
    update();
    const timer = window.setInterval(update, 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setParticipantId(window.localStorage.getItem("aicrew_participant_id") ?? "");
      try {
        setBookmarks(JSON.parse(window.localStorage.getItem("aicrew_bookmarks") ?? "[]"));
      } catch {
        setBookmarks([]);
      }
      try {
        const saved = JSON.parse(window.localStorage.getItem("aicrew_reminder") ?? "null") as { participantId?: string } | null;
        setReminderSet(Boolean(saved));
      } catch {
        setReminderSet(false);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true);
      const params = new URLSearchParams({
        date: savedOnly ? "all" : feedDate,
        month,
        featuredOnly: String(featuredOnly),
      });
      if (participantId) params.set("participantId", participantId);
      if (search.trim()) params.set("search", search.trim());
      try {
        const response = await fetch(`/api/app?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = (await response.json()) as AppData & { error?: string };
        if (!response.ok) throw new Error(result.error);
        setData(result);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setToast("데이터를 새로 불러오지 못했습니다.");
        }
      } finally {
        setBusy(false);
      }
    }, search ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [featuredOnly, feedDate, hydrated, month, participantId, savedOnly, search]);

  useEffect(() => {
    if (!hydrated || !participantId) return;
    const controller = new AbortController();
    const update = () => {
      if (document.visibilityState !== "visible") return;
      const params = new URLSearchParams({ participantId, date: savedOnly ? "all" : feedDate, month, featuredOnly: String(featuredOnly), search });
      fetch(`/api/app?${params}`, { cache: "no-store", signal: controller.signal }).then(async (response) => { if (response.ok) setData(await response.json()); }).catch(() => {});
    };
    const timer = window.setInterval(update, 60000);
    window.addEventListener("focus", update);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, [hydrated, participantId, feedDate, month, featuredOnly, savedOnly, search]);

  const chooseParticipant = (id: string) => {
    setReceipt(null);
    setSubmissionUrlError(null);
    window.localStorage.setItem("aicrew_participant_id", id);
    setParticipantId(id);
    setTab("home");
  };

  const changeParticipant = () => {
    window.localStorage.removeItem("aicrew_participant_id");
    setParticipantId("");
    setTab("home");
  };

  const toggleBookmark = (submission: Submission) => {
    const next = bookmarks.includes(submission.id)
      ? bookmarks.filter((id) => id !== submission.id)
      : [...bookmarks, submission.id];
    setBookmarks(next);
    window.localStorage.setItem("aicrew_bookmarks", JSON.stringify(next));
  };

  const refresh = async () => {
    const params = new URLSearchParams({
      participantId,
      date: savedOnly ? "all" : feedDate,
      month,
      featuredOnly: String(featuredOnly),
    });
    if (search.trim()) params.set("search", search.trim());
    const response = await fetch(`/api/app?${params}`, { cache: "no-store" });
    const result = (await response.json()) as AppData;
    if (!response.ok) throw new Error("제출 현황을 불러오지 못했습니다.");
    setData(result);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const urlError = getSubmissionUrlError(String(formData.get("url") ?? ""));
    setSubmissionUrlError(urlError);
    if (urlError) {
      form.querySelector<HTMLInputElement>('input[name="url"]')?.focus();
      return;
    }
    setBusy(true);
    setToast("");
    try {
    const response = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participantId,
        title: formData.get("title"),
        url: formData.get("url"),
        description: formData.get("description"),
        password: formData.get("password"),
      }),
    });
    const result = (await response.json()) as { error?: string; onTime?: boolean };
    if (!response.ok) {
      setToast(result.error ?? "링크를 등록하지 못했습니다.");
      return;
    }
    form.reset();
    setReceipt({ onTime: Boolean(result.onTime), url: String(formData.get("url")) });
    setToast(
      data.sharingOnly ? "✅ 프롬프트를 공유했습니다."
        : result.onTime
        ? "✅ 오늘 숙제를 완료했습니다."
        : "✅ 링크가 등록되었습니다. 마감시간 이후 등록되어 오늘 숙제 완료에는 반영되지 않습니다.",
    );
    try {
      await refresh();
    } catch {
      setToast("✅ 링크가 등록되었습니다. 제출 현황을 불러오지 못했으니 잠시 후 새로고침해 주세요.");
    }
    } catch { setToast("연결이 원활하지 않습니다. 입력 내용을 유지했어요. 제출 현황을 확인한 뒤 다시 시도해주세요."); }
    finally { setBusy(false); }
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    const formData = new FormData(event.currentTarget);
    const urlError = getSubmissionUrlError(String(formData.get("url") ?? ""));
    setEditUrlError(urlError);
    if (urlError) {
      event.currentTarget.querySelector<HTMLInputElement>('input[name="url"]')?.focus();
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/submissions/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId,
          password: formData.get("password"),
          title: formData.get("title"),
          url: formData.get("url"),
          description: formData.get("description"),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "수정하지 못했습니다.");
      setToast("프롬프트를 수정했습니다.");
      setEditing(null);
      await refresh();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "수정하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const removeEdit = async (password: string) => {
    if (!editing) return;
    const isLastValid = data.calendar.some(
      (day) =>
        day.date === kstDateKey(editing.submittedAt) &&
        day.status === "completed" &&
        day.submissions.length === 1,
    );
    const message = isLastValid
      ? "이 링크를 삭제하면 오늘 숙제가 미완료 상태가 될 수 있습니다. 삭제하시겠습니까?"
      : "이 링크를 삭제하시겠습니까?";
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/submissions/${editing.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, password }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "삭제하지 못했습니다.");
      setToast("프롬프트를 삭제했습니다.");
      setEditing(null);
      await refresh();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "삭제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const visibleFeed = useMemo(
    () => (savedOnly ? data.feed.filter((submission) => bookmarks.includes(submission.id)) : data.feed),
    [bookmarks, data.feed, savedOnly],
  );

  if (!data.challenge) {
    return (
      <main className="grid min-h-screen place-items-center px-5">
        <section className="surface-card max-w-md text-center">
          <CalendarDays className="mx-auto text-blue-600" size={34} />
          <h1 className="mt-4 text-2xl font-extrabold">현재 진행 중인 기수가 없습니다</h1>
          <p className="mt-2 leading-7 text-slate-600">관리자가 새 기수를 활성화하면 참가를 시작할 수 있어요.</p>
          <Link className="secondary-button mt-5" href="/admin">관리자 화면</Link>
        </section>
      </main>
    );
  }

  const progress = challengeProgress(data);
  const status = statusContent[data.todayStatus];
  const selectedParticipant = data.selectedParticipant;
  const completionRate = data.summary.completionRate;
  const previousCompletionRate = data.summary.previousMonthCompletionRate;
  const rateChange = completionRate !== null && previousCompletionRate !== null
    ? completionRate - previousCompletionRate
    : null;
  const crewCompletionRate = data.crewGrowth.completionRate;
  const crewGoalProgress = crewCompletionRate === null
    ? 0
    : Math.min(100, Math.round((crewCompletionRate / data.crewGrowth.goalRate) * 100));
  const penaltyStart = data.penaltyNotice?.startDate;
  const withinFirstWeek = penaltyStart !== undefined
    && kstDateKey(data.now) >= penaltyStart
    && daysUntil(penaltyStart, kstDateKey(data.now)) < 5;
  const promoteReminder = withinFirstWeek && !reminderSet;
  const firstDayOffset = data.calendar[0]
    ? (new Date(`${data.calendar[0].date}T00:00:00Z`).getUTCDay() + 6) % 7
    : 0;

  if (!participantId || (!selectedParticipant && hydrated && !busy)) {
    return (
      <main className="min-h-screen px-5 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-6 md:max-w-4xl">
          <BrandHeader demo={data.demo} />
          <ChallengeCard data={data} progress={progress} />
          <ParticipantDirectory groups={data.participantGroups} onChoose={chooseParticipant} />
          <p className="text-center text-sm leading-6 text-slate-500">선택한 이름은 이 기기에만 저장되며 언제든 바꿀 수 있어요.</p>
          <Link className="mx-auto flex items-center gap-2 py-2 text-sm font-bold text-slate-500 hover:text-blue-700" href="/admin">
            <ShieldCheck size={17} /> 관리자
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 pb-28 pt-5 sm:px-8 sm:pb-10">
      <div className="mx-auto w-full max-w-5xl">
        <BrandHeader demo={data.demo} onChangeParticipant={changeParticipant} participantName={selectedParticipant?.name} />
        <div className="mt-5 grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <ChallengeCard data={data} progress={progress} compact />
            <DesktopNav tab={tab} onChange={setTab} />
          </aside>
          <section className="min-w-0">
            {tab === "home" && (
              <div className="grid gap-5">
                <PenaltyNotice notice={data.penaltyNotice} now={data.now} />
                {promoteReminder && <ReminderCard key={`top-${participantId}`} participantId={participantId} demo={data.demo} />}
                {data.notices[0] && (
                  <article className="notice-card">
                    <Megaphone size={20} />
                    <div>
                      <p className="font-extrabold">{data.notices[0].title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{data.notices[0].content}</p>
                    </div>
                  </article>
                )}
                {data.sharingOnly ? <section className="surface-card">
                  <p className="text-sm font-bold text-blue-700">자율 공유</p>
                  <h1 className="mt-2 text-2xl font-black">{selectedParticipant?.name}님의 프롬프트를 나눠주세요</h1>
                  <p className="mt-3 leading-7 text-slate-600">원하는 날 자유롭게 공유해주세요. 챌린지 참여 의무와 미등록에 따른 금액 차감은 없습니다.</p>
                  <p className="mt-3 font-bold">이번 달 공유한 링크 {data.summary.totalLinks}개</p>
                  <button className="primary-button mt-4" type="button" onClick={() => setTab("submit")}>프롬프트 공유하기 <ArrowRight size={19} /></button>
                </section> : <>
                <section className={`status-card ${status.tone}`}>
                  <span className="text-4xl" aria-hidden="true">{status.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold opacity-70">{displayDate(kstDateKey(data.now))}</p>
                    <h1 className="mt-1 text-2xl font-black tracking-tight">{status.title}</h1>
                    <p className="mt-2 font-medium opacity-80">{status.detail}</p>
                    {data.todayStatus === "pending" && remaining && (
                      <p className="mt-2 text-sm font-black" role="status">23:00까지 {remaining} 남았어요</p>
                    )}
                  </div>
                  {data.todayStatus === "pending" && (
                    <button className="white-button" type="button" onClick={() => setTab("submit")}>링크 등록하기</button>
                  )}
                </section>
                <MissionCard data={data} onSubmit={() => setTab("submit")} />
                <WeekRecord days={data.habit.week} />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="완료" value={data.summary.completedDays} suffix="일" icon={<CheckCircle2 size={19} />} />
                  <StatCard label="미제출" value={data.summary.missedDays} suffix="일" icon={<Clock3 size={19} />} />
                  <StatCard label="등록 링크" value={data.summary.totalLinks} suffix="개" icon={<Link2 size={19} />} />
                  <StatCard label="현재 스트릭" value={data.summary.streak} suffix="일" icon={<Flame size={19} />} />
                </div>
                </>}
                <section className="surface-card">
                  <div className="flex items-center justify-between gap-3">
                    <button className="icon-button" type="button" aria-label="이전 달" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={20} /></button>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-slate-500">나의 월별 현황</p>
                      <h2 className="text-xl font-extrabold">{month.replace("-", "년 ")}월</h2>
                    </div>
                    <button className="icon-button" type="button" aria-label="다음 달" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={20} /></button>
                  </div>
                  <div className="calendar-grid mt-5 text-center text-xs font-bold text-slate-400">
                    {["월", "화", "수", "목", "금", "토", "일"].map((day) => <span key={day}>{day}</span>)}
                    {Array.from({ length: firstDayOffset }, (_, index) => <span key={`blank-${index}`} />)}
                    {data.calendar.map((day) => (
                      <button
                        className={`calendar-day calendar-${day.status}`}
                        key={day.date}
                        type="button"
                        onClick={() => setSelectedDay(day)}
                        aria-label={`${displayDate(day.date)} ${data.sharingOnly ? `공유 링크 ${day.submissions.length}개` : statusLabel[day.status]}`}
                      >
                        <span>{day.day}</span>
                        <strong>{data.sharingOnly ? (day.submissions.length > 0 ? "🔗" : "—") : statusMark[day.status]}</strong>
                      </button>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-slate-600">
                    {data.sharingOnly ? <span>🔗 프롬프트 공유한 날</span> : <><span>✅ 완료</span><span>❌ 미제출</span><span>🟦 면제</span><span className="text-slate-400">회색 비대상일</span></>}
                  </div>
                </section>
                {!data.sharingOnly && !promoteReminder && <ReminderCard key={participantId} participantId={participantId} demo={data.demo} />}
              </div>
            )}

            {tab === "submit" && (
              <section className="surface-card mx-auto max-w-2xl">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-blue-700">{displayDate(kstDateKey(data.now))} · {selectedParticipant?.name}</p>
                    <h1 className="mt-1 text-2xl font-black">오늘 써본 AI, 링크로 남겨요</h1>
                    <p className="mt-2 text-sm leading-6 text-slate-600">짧은 질문도, 기대와 달랐던 답도 괜찮아요. 직접 써봤다면 충분해요.</p>
                    <p className="mt-2 text-sm font-semibold text-slate-500">{data.sharingOnly ? "자율 공유 · 미등록 차감 없음" : "오늘 숙제 제출 마감 23:00"}</p>
                  </div>
                  <span className="grid size-12 place-items-center rounded-2xl bg-lime-100 text-lime-800"><Plus size={25} /></span>
                </div>
                {receipt && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4" role="status"><strong>{data.sharingOnly ? "프롬프트 공유 완료" : receipt.onTime ? "오늘 숙제 인정 완료" : "링크 공유 완료 · 오늘 숙제 인정에는 미반영"}</strong><a className="mt-2 block break-all text-sm text-blue-700 underline" href={receipt.url} target="_blank" rel="noopener noreferrer">등록한 링크 확인</a><p className="mt-2 text-xs text-slate-600">공유 탭에서 등록 내용을 확인할 수 있어요. 수정·삭제는 등록 당일 23:00까지 가능합니다.</p><button className="secondary-button mt-3" type="button" onClick={() => setTab("home")}>내 현황 보기<ArrowRight size={17} /></button></div>}
                <form className="grid gap-5" onSubmit={onSubmit}>
                  <div className="grid gap-2">
                    <label htmlFor="submission-url" className="font-extrabold">AI 활용 링크 <span className="text-red-500">*</span></label>
                    <input id="submission-url" className="form-input" name="url" type="url" required maxLength={2048} placeholder="https://chatgpt.com/share/..." aria-invalid={Boolean(submissionUrlError)} aria-describedby={submissionUrlError ? "submission-url-help submission-url-error" : "submission-url-help"} onChange={() => setSubmissionUrlError(null)} />
                    <ShareLinkHelp id="submission-url-help" errorId="submission-url-error" error={submissionUrlError} />
                  </div>
                  <Field label="제목" hint="선택사항">
                    <input className="form-input" name="title" maxLength={120} placeholder="예: 회의자료 AI로 요약하기" />
                  </Field>
                  <Field label="간단한 설명" hint="선택사항">
                    <textarea className="form-input min-h-28 resize-y" name="description" maxLength={1000} placeholder="어떻게 활용했는지 간단히 남겨보세요." />
                  </Field>
                  <Field label="수정·삭제 비밀번호" required>
                    <input className="form-input" name="password" type="password" required minLength={4} maxLength={72} autoComplete="new-password" placeholder="4자 이상" />
                  </Field>
                  <div className="rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold leading-6 text-blue-950">
                    <p>{data.sharingOnly ? "※ 자율 공유는 시간에 관계없이 등록할 수 있고, 미등록 차감이 없습니다." : "※ 숙제 제출 인정 마감은 23:00입니다."}</p>
                    <p>※ 수정·삭제는 등록 당일 23:00까지 가능합니다.</p>
                  </div>
                  <button className="primary-button" disabled={busy} type="submit">{busy ? "등록 중..." : "링크 등록하기"} <ArrowRight size={19} /></button>
                </form>
              </section>
            )}

            {tab === "feed" && (
              <div className="grid gap-4">
                <section className="surface-card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-blue-700">함께 배우기</p>
                      <h1 className="text-2xl font-black">{savedOnly ? "내가 저장한 프롬프트" : "공유 피드"}</h1>
                    </div>
                    <button className={`filter-button ${savedOnly ? "filter-active" : ""}`} type="button" onClick={() => setSavedOnly(!savedOnly)}>
                      <Bookmark size={17} fill={savedOnly ? "currentColor" : "none"} /> 저장한 프롬프트
                    </button>
                  </div>
                  {!savedOnly && (
                    <div className="mt-5 flex items-center justify-between gap-2">
                      <button className="icon-button" type="button" aria-label="이전 날" onClick={() => setFeedDate(addDate(feedDate, -1))}><ChevronLeft size={20} /></button>
                      <input className="date-input" type="date" max={kstDateKey(data.now)} value={feedDate} onChange={(event) => setFeedDate(event.target.value)} />
                      <button className="icon-button" type="button" aria-label="다음 날" disabled={feedDate >= kstDateKey(data.now)} onClick={() => setFeedDate(addDate(feedDate, 1))}><ChevronRight size={20} /></button>
                    </div>
                  )}
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                    <label className="search-box">
                      <Search size={18} />
                      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름, 제목, 설명 검색" aria-label="프롬프트 검색" />
                    </label>
                    <button className={`filter-button ${featuredOnly ? "filter-active" : ""}`} type="button" onClick={() => setFeaturedOnly(!featuredOnly)}>
                      <Star size={17} fill={featuredOnly ? "currentColor" : "none"} /> 따라 해볼 사례
                    </button>
                  </div>
                </section>
                {busy && <p className="text-center text-sm font-semibold text-slate-500">불러오는 중...</p>}
                {!busy && visibleFeed.length === 0 && (
                  <section className="surface-card py-12 text-center">
                    <Sparkles className="mx-auto text-blue-500" size={30} />
                    {search.trim() || featuredOnly || savedOnly ? (
                      <>
                        <p className="mt-3 font-extrabold">조건에 맞는 프롬프트가 없습니다</p>
                        <p className="mt-1 text-sm text-slate-500">다른 날짜나 검색어를 확인해보세요.</p>
                      </>
                    ) : (
                      <>
                        <p className="mt-3 font-extrabold">첫 링크를 남겨 크루의 첫 기록을 만들어요</p>
                        <p className="mt-1 text-sm text-slate-500">아직 이날 공유된 프롬프트가 없어요.</p>
                        <button className="secondary-button mx-auto mt-4" type="button" onClick={() => setTab("submit")}>링크 등록하기<ArrowRight size={17} /></button>
                      </>
                    )}
                  </section>
                )}
                {visibleFeed.map((submission) => (
                  <article className="feed-card" key={submission.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="avatar-mini">{submission.participantName.slice(0, 1)}</span>
                          <span className="font-extrabold">{submission.participantName}</span>
                          <span className="text-sm font-semibold text-slate-400">{displayDate(kstDateKey(submission.submittedAt))} {formatKstTime(submission.submittedAt)}</span>
                          {submission.isFeatured && <span className="featured-badge">✨ 따라 해봐요</span>}
                        </div>
                        {submission.title && <h2 className="mt-4 text-xl font-black tracking-tight">{submission.title}</h2>}
                        {submission.description && <p className="mt-2 leading-7 text-slate-600">{submission.description}</p>}
                      </div>
                      <button className="bookmark-button" type="button" aria-label="북마크" onClick={() => toggleBookmark(submission)}>
                        <Bookmark size={20} fill={bookmarks.includes(submission.id) ? "currentColor" : "none"} />
                      </button>
                    </div>
                    <a className="link-chip mt-4" href={submission.url} target="_blank" rel="noopener noreferrer">
                      <Link2 size={17} /><span>{hostLabel(submission.url)}</span><ExternalLink size={15} />
                    </a>
                    {submission.participantId === participantId && canParticipantEdit(submission.submittedAt, data.now) && (
                      <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                        <button className="small-action" type="button" onClick={() => { setEditUrlError(null); setEditing(submission); }}><Pencil size={15} /> 수정·삭제</button>
                        <span className="ml-auto self-center text-xs font-semibold text-slate-400">오늘 등록한 글만 가능</span>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}

            {tab === "growth" && (
              <div className="grid gap-5">
                <section className="growth-hero">
                  <Sparkles size={30} />
                  <div>
                    <p className="text-sm font-bold text-blue-900/70">{month.replace("-", "년 ")}월</p>
                    <h1 className="text-2xl font-black">크루 성장</h1>
                    <p className="mt-1 text-sm font-semibold text-blue-950/70">서로의 순위보다 나의 꾸준함과 우리의 변화를 확인해요.</p>
                  </div>
                </section>
                <section className="surface-card">
                  <div>
                    <p className="text-sm font-bold text-blue-700">비교 없는 개인 기록</p>
                    <h2 className="mt-1 text-xl font-black">{selectedParticipant?.name}님의 성장</h2>
                  </div>
                  {data.sharingOnly ? <p className="mt-5 leading-7 text-slate-600">이번 달 {data.summary.totalLinks}개의 프롬프트를 공유했어요. 자율 공유는 제출률이나 미제출을 집계하지 않습니다.</p> : <>
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <GrowthMetric label="이번 달 제출률" value={completionRate === null ? "집계 전" : `${completionRate}%`} detail="확정 대상일 기준" icon={<CheckCircle2 size={19} />} />
                    <GrowthMetric label="완료한 날" value={`${data.summary.completedDays}일`} detail="이번 달 기록" icon={<CalendarDays size={19} />} />
                    <GrowthMetric label="현재 연속 달성" value={`${data.summary.streak}일`} detail="면제·휴일은 유지" icon={<Flame size={19} />} />
                    <GrowthMetric label="나의 최고 기록" value={`${data.summary.bestStreak}일`} detail="챌린지 시작 이후" icon={<Sparkles size={19} />} />
                  </div>
                  <div className="growth-insight mt-4">
                    {completionRate === null
                      ? "확정된 숙제 대상일이 생기면 이번 달 제출률을 알려드릴게요."
                      : rateChange === null
                        ? "지난달 비교 기록이 아직 없어요. 이번 달의 꾸준함이 새로운 기준이 됩니다."
                        : rateChange > 0
                          ? `지난달보다 제출률이 ${rateChange}%p 높아졌어요. 좋은 흐름을 이어가세요.`
                          : rateChange < 0
                            ? `지난달보다 제출률이 ${Math.abs(rateChange)}%p 낮지만, 오늘의 한 번부터 다시 쌓을 수 있어요.`
                            : "지난달과 같은 제출률을 유지하고 있어요. 꾸준함이 쌓이고 있습니다."}
                  </div>
                  </>}
                </section>
                <section className="surface-card">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-emerald-700">함께 만든 변화</p>
                      <h2 className="mt-1 text-xl font-black">크루 공동 목표</h2>
                    </div>
                    <p className="text-3xl font-black text-emerald-700">{crewCompletionRate === null ? "—" : `${crewCompletionRate}%`}</p>
                  </div>
                  <div className="growth-progress-track mt-5" role="progressbar" aria-label={`크루 제출률 ${crewCompletionRate ?? 0}%, 공동 목표 ${data.crewGrowth.goalRate}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={crewCompletionRate ?? 0}>
                    <span className="growth-progress-bar" style={{ width: `${crewGoalProgress}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-xs font-bold text-slate-500">
                    <span>함께 달성 중</span>
                    <span>공동 목표 {data.crewGrowth.goalRate}%</span>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <CrewMetric label="함께 완료" value={`${data.crewGrowth.completedDays}/${data.crewGrowth.decidedDays}회`} detail="확정된 숙제 대상 횟수" />
                    <CrewMetric label="공유한 링크" value={`${data.crewGrowth.totalLinks}개`} detail="이번 달 크루 전체" />
                    <CrewMetric label="함께한 구성원" value={`${data.crewGrowth.participantCount}명`} detail="이름과 순위 없이 합계만" />
                  </div>
                </section>
                <p className="text-center text-sm leading-6 text-slate-500">다른 참가자의 완료일·미제출·연속 달성은 표시하지 않으며, 운영에 필요한 상세 현황은 관리자 화면에서만 확인합니다.</p>
              </div>
            )}
          </section>
        </div>
      </div>

      <nav className="mobile-nav" aria-label="주요 메뉴">
        <NavButton active={tab === "home"} icon={<Home size={21} />} label="내 현황" onClick={() => setTab("home")} />
        <NavButton active={tab === "submit"} icon={<Plus size={22} />} label="등록" onClick={() => setTab("submit")} />
        <NavButton active={tab === "feed"} icon={<Link2 size={21} />} label="공유" onClick={() => setTab("feed")} />
        <NavButton active={tab === "growth"} icon={<Sparkles size={21} />} label="성장" onClick={() => setTab("growth")} />
      </nav>

      {selectedDay && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedDay(null)}>
          <section className="modal-panel" role="dialog" aria-modal="true" aria-label="날짜별 등록 링크" onMouseDown={(event) => event.stopPropagation()}>
            <button className="absolute right-4 top-4 rounded-full p-2 hover:bg-slate-100" type="button" aria-label="닫기" onClick={() => setSelectedDay(null)}><X size={20} /></button>
            <p className="text-sm font-bold text-blue-700">{displayDate(selectedDay.date)}</p>
            <h2 className="mt-1 text-xl font-black">등록한 링크</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">{data.sharingOnly ? "자율 공유 기록" : `상태: ${statusContent[selectedDay.status].title}`}</p>
            <div className="mt-5 grid gap-3">
              {selectedDay.submissions.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">이날 등록한 링크가 없습니다.</p>}
              {selectedDay.submissions.map((submission) => (
                <a className="participant-button" href={submission.url} target="_blank" rel="noopener noreferrer" key={submission.id}>
                  <Link2 size={18} className="text-blue-600" />
                  <span className="min-w-0 flex-1 truncate font-bold">{submission.title || hostLabel(submission.url)}</span>
                  <ExternalLink size={16} />
                </a>
              ))}
            </div>
          </section>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => { if (!busy) setEditing(null); }}>
          <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="submission-edit-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="absolute right-4 top-4 rounded-full p-2 hover:bg-slate-100" type="button" aria-label="닫기" disabled={busy} onClick={() => setEditing(null)}><X size={20} /></button>
            <p className="text-sm font-bold text-blue-700">{displayDate(kstDateKey(editing.submittedAt))} 등록</p>
            <h2 className="mt-1 text-xl font-black" id="submission-edit-title">등록한 링크 수정</h2>
            <form className="mt-5 grid gap-4" onSubmit={saveEdit}>
              <div className="grid gap-2">
                <label htmlFor="edit-url" className="font-extrabold">AI 활용 링크 <span className="text-red-500">*</span></label>
                <input id="edit-url" className="form-input" name="url" type="url" required maxLength={2048} defaultValue={editing.url} aria-invalid={Boolean(editUrlError)} aria-describedby={editUrlError ? "edit-url-help edit-url-error" : "edit-url-help"} onChange={() => setEditUrlError(null)} />
                <ShareLinkHelp id="edit-url-help" errorId="edit-url-error" error={editUrlError} />
              </div>
              <Field label="제목" hint="선택사항">
                <input className="form-input" name="title" maxLength={120} defaultValue={editing.title ?? ""} />
              </Field>
              <Field label="간단한 설명" hint="선택사항">
                <textarea className="form-input min-h-24 resize-y" name="description" maxLength={1000} defaultValue={editing.description ?? ""} />
              </Field>
              <Field label="수정·삭제 비밀번호" required>
                <input className="form-input" name="password" type="password" required minLength={4} maxLength={72} autoComplete="current-password" placeholder="등록할 때 정한 비밀번호" />
              </Field>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <button className="small-action text-red-600" type="button" disabled={busy} onClick={(event) => { const form = event.currentTarget.closest("form"); const password = form?.querySelector<HTMLInputElement>("input[name=password]")?.value ?? ""; if (password.length < 4) { setToast("삭제하려면 비밀번호를 먼저 입력해주세요."); return; } void removeEdit(password); }}><Trash2 size={15} /> 삭제</button>
                <div className="flex gap-2"><button className="filter-button" type="button" disabled={busy} onClick={() => setEditing(null)}>취소</button><button className="primary-button !w-auto" type="submit" disabled={busy}>{busy ? "처리 중..." : "저장"}</button></div>
              </div>
            </form>
            <p className="mt-3 text-xs leading-5 text-slate-500">수정·삭제는 등록 당일 23:00까지 가능합니다.</p>
          </section>
        </div>
      )}

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span>{toast}</span>
          <button type="button" aria-label="알림 닫기" onClick={() => setToast("")}><X size={17} /></button>
        </div>
      )}
    </main>
  );
}

function PenaltyNotice({ notice, now }: { notice: AppData["penaltyNotice"]; now: string }) {
  if (!notice || notice.phase === "running") return null;
  const amount = new Intl.NumberFormat("ko-KR").format(notice.dailyAmount);
  const startLabel = displayDate(notice.startDate);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(`${notice.startDate}T00:00:00Z`).getUTCDay()];
  const daysLeft = notice.daysUntilStart || daysUntil(kstDateKey(now), notice.startDate);
  if (notice.phase === "first_day") {
    return (
      <article className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-5" role="status">
        <p className="text-sm font-black text-amber-700">오늘부터 시작이에요</p>
        <h2 className="mt-1 text-xl font-black text-amber-950">지금부터 미제출은 하루 {amount}원이 차감돼요</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-amber-900">평일 23:00까지 오늘 써본 AI 링크를 남겨주세요. 주말과 휴일, 면제일은 차감하지 않아요.</p>
      </article>
    );
  }
  return (
    <article className="rounded-3xl border-2 border-blue-200 bg-blue-50 p-5" role="status">
      <p className="text-sm font-black text-blue-700">시작까지 {daysLeft}일</p>
      <h2 className="mt-1 text-xl font-black text-blue-950">{startLabel}({weekday})부터 시작해요</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-blue-900">그날부터 평일 23:00까지 미제출이면 하루 {amount}원이 차감돼요. 지금은 연습 기간이니 미리 링크를 남겨보셔도 좋아요.</p>
    </article>
  );
}

function BrandHeader({ demo, participantName, onChangeParticipant }: { demo: boolean; participantName?: string; onChangeParticipant?: () => void }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="brand-mark">AI</span>
        <div><p className="text-sm font-semibold text-blue-700">부산 동구</p><p className="text-xl font-extrabold tracking-tight">AI 러닝크루</p></div>
      </div>
      <div className="flex items-center gap-2">
        {demo && <span className="hidden rounded-full bg-amber-100 px-3 py-1.5 text-xs font-extrabold text-amber-800 sm:inline">체험 데이터</span>}
        {participantName && (
          <button className="user-chip" type="button" onClick={onChangeParticipant}><UserRound size={17} />{participantName}<LogOut size={15} /></button>
        )}
      </div>
    </header>
  );
}

function ChallengeCard({ data, progress, compact = false }: { data: AppData; progress: number; compact?: boolean }) {
  if (data.sharingOnly) {
    const group = data.participantGroups.find((item) => item.members.some((member) => member.id === data.selectedParticipant?.id));
    return <section className={`challenge-card ${compact ? "p-5" : ""}`}>
      <p className="text-sm font-semibold text-blue-100">AI 러닝크루</p>
      <h2 className="mt-2 text-2xl font-extrabold">{group?.name} 자율 공유</h2>
      <p className="mt-2 text-sm text-blue-100">원하는 날 자유롭게 · 미등록 차감 없음</p>
    </section>;
  }
  return (
    <section className={`challenge-card ${compact ? "p-5" : ""}`}>
      <p className="text-sm font-semibold text-blue-100">현재 챌린지</p>
      <div className={`mt-2 flex ${compact ? "flex-col items-start gap-4" : "items-end justify-between gap-4"}`}>
        <div><h2 className={compact ? "text-xl font-extrabold" : "text-2xl font-extrabold"}>{data.challenge?.name}</h2><p className="mt-1 text-sm text-blue-100">{data.challenge?.startDate.replaceAll("-", ".")} — {data.challenge?.endDate.replaceAll("-", ".")}</p></div>
        <div className="progress-ring" aria-label={`챌린지 진행률 ${progress}퍼센트`}>{progress}%</div>
      </div>
    </section>
  );
}

function DesktopNav({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="mt-4 grid gap-1 rounded-3xl border border-slate-200 bg-white/90 p-2">
      <NavButton active={tab === "home"} icon={<Home size={19} />} label="내 현황" onClick={() => onChange("home")} />
      <NavButton active={tab === "submit"} icon={<Plus size={20} />} label="링크 등록" onClick={() => onChange("submit")} />
      <NavButton active={tab === "feed"} icon={<Link2 size={19} />} label="공유 피드" onClick={() => onChange("feed")} />
      <NavButton active={tab === "growth"} icon={<Sparkles size={19} />} label="크루 성장" onClick={() => onChange("growth")} />
      <Link className="nav-button mt-2 border-t border-slate-100 pt-3" href="/admin"><ShieldCheck size={19} /><span>관리자</span></Link>
    </nav>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={`nav-button ${active ? "nav-active" : ""}`} type="button" onClick={onClick}>{icon}<span>{label}</span></button>;
}

function StatCard({ label, value, suffix, icon }: { label: string; value: number; suffix: string; icon: React.ReactNode }) {
  return <article className="stat-card"><span className="text-blue-600">{icon}</span><p className="mt-3 text-sm font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}<span className="ml-1 text-sm font-bold text-slate-500">{suffix}</span></p></article>;
}

function GrowthMetric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return <article className="rounded-2xl bg-slate-50 p-4"><span className="text-blue-600">{icon}</span><p className="mt-3 text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-xl font-black">{value}</p><p className="mt-1 text-xs font-semibold text-slate-400">{detail}</p></article>;
}

function CrewMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4"><p className="text-xs font-bold text-emerald-700">{label}</p><p className="mt-1 text-xl font-black text-slate-900">{value}</p><p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p></article>;
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <label className="grid gap-2"><span className="flex items-center gap-2 font-extrabold">{label}{required && <span className="text-red-500">*</span>}{hint && <span className="text-xs font-semibold text-slate-400">{hint}</span>}</span>{children}</label>;
}

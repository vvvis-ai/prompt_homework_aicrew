"use client";

import { ArrowUpRight, CheckCircle2, Link2, Users } from "lucide-react";
import { useId, useState } from "react";
import { activityWeeks } from "@/lib/challenge-progress";
import { kstDateKey } from "@/lib/time";
import type { ActivityDay, Challenge, ChallengeProgress } from "@/lib/types";

const activityLevel = (count: number) => count === 0 ? 0 : count <= 5 ? 1 : count <= 10 ? 2 : count <= 20 ? 3 : 4;
const dateLabel = (date: string) => date.replaceAll("-", ".");
const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
type ActivityView = "daily" | "weekly" | "cumulative";

export function ChallengeDashboard({ challenge, progress, now, onGrowth }: {
  challenge: Challenge;
  progress: ChallengeProgress | null;
  now: string;
  onGrowth?: () => void;
}) {
  const today = kstDateKey(now);
  const before = today < challenge.startDate;
  const ended = today > challenge.endDate;

  return (
    <section className="challenge-dashboard" aria-label="챌린지 진행 현황">
      <div className="dashboard-content" aria-busy={!progress}>
        {progress ? <DashboardContent progress={progress} today={today} before={before} ended={ended} /> : <DashboardSkeleton />}
      </div>

      <div className="dashboard-footnote">
        <p>활동 그래프는 현재 챌린지 참가자 전체의 공유 기록입니다.<br />마감 후·주말·공휴일·운영 제외일의 공유는 집계하지 않아요. 제출률은 완료·확정 미제출 기준이며, 오늘 대기·면제·휴일은 제외해요.</p>
        {onGrowth && <button type="button" onClick={onGrowth}>성장 자세히 보기 <ArrowUpRight size={16} /></button>}
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return <>
    <div className="dashboard-summary">
      <div className="dashboard-crew">
        <h3><Users size={16} /> 크루 공동 목표</h3>
        <div className="dashboard-skeleton mt-4 h-4 w-28" aria-hidden="true" />
        <div className="dashboard-skeleton my-3 h-11 w-24" aria-hidden="true" />
        <div className="dashboard-skeleton h-2 w-full" aria-hidden="true" />
        <div className="dashboard-skeleton mt-4 h-4 w-4/5" aria-hidden="true" />
        <div className="dashboard-skeleton mt-3 h-4 w-full" aria-hidden="true" />
        <div className="dashboard-skeleton mt-3 h-8 w-full" aria-hidden="true" />
      </div>
      <div className="dashboard-today">
        <h3><CheckCircle2 size={16} /> 오늘의 크루 현황</h3>
        <div className="dashboard-skeleton mt-4 h-4 w-4/5" aria-hidden="true" />
        <div className="dashboard-today-counts" aria-hidden="true">
          <div className="dashboard-skeleton h-20" />
          <div className="dashboard-skeleton h-20" />
        </div>
        <div className="dashboard-skeleton mt-3 h-10 w-full" aria-hidden="true" />
      </div>
    </div>
    <div className="activity-section">
      <div className="activity-heading">
        <div>
          <h3>크루 전체 AI 활동</h3>
          <p role="status">챌린지 현황을 불러오고 있어요.</p>
        </div>
      </div>
      <div className="dashboard-skeleton h-56 w-full" aria-hidden="true" />
      <div className="dashboard-skeleton mt-4 h-3 w-2/3 ml-auto" aria-hidden="true" />
      <div className="dashboard-skeleton mt-4 h-8 w-full" aria-hidden="true" />
    </div>
  </>;
}

function DashboardContent({ progress, today, before, ended }: {
  progress: ChallengeProgress; today: string; before: boolean; ended: boolean;
}) {
  const { crew } = progress;
  const rate = crew.completionRate;
  const crewMessage = rate === null ? "첫 완료 기록을 기다리고 있어요"
    : rate >= crew.goalRate ? "확정 기준으로 공동 목표를 달성하고 있어요"
      : `확정 기준 공동 목표까지 ${crew.goalRate - rate}%p 남았어요`;

  return <>
      <div className="dashboard-summary">
        <div className="dashboard-crew">
          <div className="flex items-center justify-between gap-2">
            <h3><Users size={16} /> 크루 공동 목표</h3>
            <span className="text-xs font-bold text-slate-500">목표 {crew.goalRate}%</span>
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-500">확정 기준 제출률</p>
          <p className="dashboard-main-number">{rate === null ? "—" : rate}<span>{rate === null ? " 집계 전" : " %"}</span></p>
          <div className="dashboard-track dashboard-crew-track" role="progressbar" aria-label="크루 전체 확정 기준 제출률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rate ?? 0} aria-valuetext={rate === null ? "집계 전" : `${rate}%, 목표 ${crew.goalRate}%`}>
            <span style={{ width: `${rate ?? 0}%` }} />
            <i style={{ left: `${crew.goalRate}%` }} aria-hidden="true" />
          </div>
          <p className="mt-3 text-xs font-semibold text-teal-800">{crewMessage}</p>
          <p className="mt-2 text-xs text-slate-500">함께 완료 {crew.completedDays.toLocaleString()}회 / {crew.decidedDays.toLocaleString()}회 · 공유 {crew.totalLinks.toLocaleString()}개</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">완료 ÷ (완료 + 확정 미제출). 오늘 대기는 아직 포함하지 않아요.</p>
        </div>
        <div className="dashboard-today">
          <h3><CheckCircle2 size={16} /> 오늘의 크루 현황</h3>
          <p className="mt-3 text-xs text-slate-500">{dateLabel(today)} · 제출 대상 {crew.today.target}명</p>
          <div className="dashboard-today-counts">
            <p><span>완료</span><strong>{crew.today.completed}<small>명</small></strong></p>
            <p><span>제출대기</span><strong>{crew.today.pending}<small>명</small></strong></p>
          </div>
          {crew.today.missed > 0 && <p className="mt-2 text-xs font-semibold text-amber-800">마감 후 미제출 {crew.today.missed}명</p>}
          <p className="mt-3 text-xs leading-5 text-slate-500">{before ? "챌린지 시작 전이에요." : ended ? "챌린지가 종료되어 오늘은 집계하지 않아요." : crew.today.target === 0 ? "오늘은 제출 대상이 없어요. 휴일·면제·참여 기간을 반영했어요." : crew.today.pending > 0 ? "대기 인원은 오늘 23:00까지 참여할 수 있어요." : crew.today.completed === crew.today.target ? "오늘 제출 대상 모두 완료했어요." : "오늘 제출이 마감되었어요."}</p>
          {crew.today.exempt > 0 && <p className="mt-2 text-xs text-slate-500">오늘 면제 {crew.today.exempt}명은 제출 대상에서 제외해요.</p>}
        </div>
      </div>

      <ActivityChart days={progress.activity} today={today} totalLinks={crew.totalLinks} activeDays={crew.activeDays} />

  </>;
}

function ActivityChart({ days, today, totalLinks, activeDays }: {
  days: ActivityDay[]; today: string; totalLinks: number; activeDays: number;
}) {
  const [view, setView] = useState<ActivityView>("daily");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const chartId = useId();
  const weeks = activityWeeks(days);
  const selected = days.find((day) => day.date === selectedDate);
  const weekly = weeks.map((week) => ({
    days: week.filter((day): day is ActivityDay => day !== null),
    count: week.reduce((sum, day) => sum + (day?.count ?? 0), 0),
  }));
  const maxWeek = Math.max(1, ...weekly.map((week) => week.count));
  const cumulative = days.filter((day) => day.date <= today).reduce<Array<{ date: string; count: number }>>((result, day) => {
    result.push({ date: day.date, count: (result.at(-1)?.count ?? 0) + day.count });
    return result;
  }, []);
  const points = cumulative.map((day, index) => ({
    x: 24 + (index / Math.max(1, cumulative.length - 1)) * 512,
    y: 134 - (day.count / Math.max(1, totalLinks)) * 110,
    ...day,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const lastPoint = points.at(-1);

  return (
    <div className="activity-section">
      <div className="activity-heading">
        <div>
          <h3>크루 전체 AI 활동</h3>
          <p>참가자들이 <strong>{activeDays}일</strong> 동안 함께 남긴 링크 <strong>{totalLinks.toLocaleString()}개</strong></p>
        </div>
        <div className="activity-view-switch" role="group" aria-label="활동 보기 방식">
          {([["daily", "일별"], ["weekly", "주별"], ["cumulative", "누적"]] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={view === value} aria-controls={chartId} onClick={() => setView(value)}>{label}</button>
          ))}
        </div>
      </div>

      <div id={chartId}>
        {view === "daily" && <>
          <div className="activity-scroll" tabIndex={0} role="region" aria-label="날짜별 활동 격자. 좌우로 스크롤하여 전체 기간을 확인하세요.">
            <div className="activity-heatmap">
              <div className="activity-weekdays" aria-hidden="true"><span />{["월", "화", "수", "목", "금", "토", "일"].map((day) => <span key={day}>{day}</span>)}</div>
              {weeks.map((week, index) => {
                const first = week.find((day) => day !== null)!;
                const monthStart = week.find((day) => day?.date.endsWith("-01"));
                const labelDate = monthStart?.date ?? (index === 0 ? first.date : null);
                return <div className="activity-week" key={first.date}>
                  <span className="activity-month">{labelDate ? `${Number(labelDate.slice(5, 7))}월` : ""}</span>
                  {week.map((day, dayIndex) => day ? (
                    <button
                      key={day.date} type="button"
                      className={`activity-cell activity-level-${activityLevel(day.count)}${day.date > today ? " activity-future" : ""}${day.date === today ? " activity-today" : ""}`}
                      disabled={day.date > today}
                      aria-pressed={selectedDate === day.date}
                      aria-label={`${dateLabel(day.date)}, 크루 전체 공유 ${day.count}개, 공유한 참가자 ${day.participantCount}명${day.date > today ? ", 예정" : ""}`}
                      title={`${dateLabel(day.date)} · ${day.participantCount}명이 공유한 링크 ${day.count}개`}
                      onClick={() => setSelectedDate(day.date)}
                    />
                  ) : <span className="activity-cell activity-padding" key={`padding-${dayIndex}`} />)}
                </div>;
              })}
            </div>
          </div>
          <div className="activity-legend" aria-label="활동 색상 범례">
            <span>링크 수</span>{["0", "1–5", "6–10", "11–20", "21+"].map((label, level) => <span key={label}><i className={`activity-level-${level}`} />{label}</span>)}<span><i className="activity-future" />예정</span>
          </div>
          <p className="activity-detail" aria-live="polite">{selected ? `${dateLabel(selected.date)} · ${selected.participantCount}명이 공유한 링크 ${selected.count}개` : "날짜 칸을 누르면 그날의 전체 공유 수와 공유한 참가자 수를 확인할 수 있어요."}</p>
        </>}

        {view === "weekly" && <>
          <p className="mb-3 text-xs text-slate-500">월요일~일요일 기준 · 참가자 전체의 주별 공유 링크 수</p>
          <div className="activity-scroll" tabIndex={0} role="region" aria-label="주별 링크 수 그래프">
            <div className="activity-weekly-chart">
              {weekly.map((week) => <div className="activity-bar-column" key={week.days[0].date} aria-label={`${dateLabel(week.days[0].date)}부터 ${dateLabel(week.days.at(-1)!.date)}까지 ${week.count}개`}>
                <span className="activity-bar-value">{week.days[0].date > today ? "—" : week.count}</span>
                <div className="activity-bar-track"><span style={{ height: `${week.count / maxWeek * 100}%` }} /></div>
                <span className="activity-bar-label">{shortDate(week.days[0].date)}</span>
              </div>)}
            </div>
          </div>
        </>}

        {view === "cumulative" && <>
          {points.length > 0 ? <>
            <svg className="activity-cumulative" viewBox="0 0 560 160" role="img" aria-label={`${dateLabel(cumulative[0].date)}부터 ${dateLabel(cumulative.at(-1)!.date)}까지 누적 공유 ${totalLinks}개`}>
              <line x1="24" y1="134" x2="536" y2="134" stroke="#e2e8f0" />
              <line x1="24" y1="24" x2="536" y2="24" stroke="#e2e8f0" strokeDasharray="4 5" />
              <text x="24" y="15" fontSize="11" fill="#64748b">{Math.max(1, totalLinks)}개</text>
              <text x="8" y="138" fontSize="11" fill="#64748b">0</text>
              <polygon points={`24,134 ${line} ${lastPoint!.x},134`} fill="#2457e6" fillOpacity="0.07" />
              <polyline points={line} fill="none" stroke="#2457e6" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={lastPoint!.x} cy={lastPoint!.y} r="4" fill="#2457e6" />
              <text x="24" y="156" fontSize="11" fill="#64748b">{shortDate(cumulative[0].date)}</text>
              {cumulative.length > 1 && <text x="536" y="156" textAnchor="end" fontSize="11" fill="#64748b">{shortDate(cumulative.at(-1)!.date)}</text>}
            </svg>
            <p className="activity-detail"><Link2 size={14} /> 챌린지 시작부터 함께 쌓은 공유 링크 {totalLinks.toLocaleString()}개</p>
          </> : <p className="activity-empty">챌린지가 시작되면 누적 기록이 표시돼요.</p>}
        </>}
      </div>
      {totalLinks === 0 && today >= (days[0]?.date ?? today) && <p className="mt-3 text-sm text-slate-500">아직 집계 대상 공유가 없어요. 휴일·운영 제외일을 제외한 날, 마감 시간 내에 링크를 남겨보세요.</p>}
    </div>
  );
}

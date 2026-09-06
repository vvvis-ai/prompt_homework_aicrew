"use client";

import { ArrowRight, CheckCircle2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

type Participant = { id: string; name: string };

export function ParticipantSelector({ participants }: { participants: Participant[] }) {
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("aicrew_participant_id");
    if (saved && participants.some((participant) => participant.id === saved)) {
      const timer = window.setTimeout(() => setSelectedId(saved), 0);
      return () => window.clearTimeout(timer);
    }
  }, [participants]);

  const selected = participants.find((participant) => participant.id === selectedId);

  if (selected) {
    return (
      <section className="surface-card animate-rise" aria-live="polite">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
            <CheckCircle2 size={24} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-500">안녕하세요, {selected.name}님</p>
            <h2 className="text-xl font-extrabold text-slate-950">오늘 아직 제출하지 않았습니다</h2>
          </div>
        </div>
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium leading-6 text-amber-900">
          ⏳ 오늘 23:00까지 AI 활용 링크를 등록해주세요.
        </p>
        <button className="primary-button mt-4" type="button">
          링크 등록하기 <ArrowRight size={19} aria-hidden="true" />
        </button>
        <button
          className="mt-3 w-full py-2 text-sm font-bold text-slate-500 hover:text-slate-900"
          type="button"
          onClick={() => {
            window.localStorage.removeItem("aicrew_participant_id");
            setSelectedId("");
          }}
        >
          사용자 변경
        </button>
      </section>
    );
  }

  return (
    <section className="surface-card">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-blue-100 text-blue-700">
          <UserRound size={23} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-500">처음 오셨나요?</p>
          <h2 className="text-xl font-extrabold text-slate-950">내 이름을 선택해주세요</h2>
        </div>
      </div>
      <div className="mt-5 grid gap-3">
        {participants.map((participant) => (
          <button
            className="participant-button"
            key={participant.id}
            type="button"
            onClick={() => {
              window.localStorage.setItem("aicrew_participant_id", participant.id);
              setSelectedId(participant.id);
            }}
          >
            <span className="avatar" aria-hidden="true">{participant.name.slice(0, 1)}</span>
            <span className="flex-1 text-left text-base font-bold">{participant.name}</span>
            <ArrowRight size={19} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

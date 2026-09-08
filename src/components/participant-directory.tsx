"use client";

import { useState } from "react";
import { ArrowRight, UserRound } from "lucide-react";
import type { ParticipantGroup } from "@/lib/types";

export function ParticipantDirectory({ groups, onChoose }: {
  groups: ParticipantGroup[];
  onChoose: (id: string) => void;
}) {
  const [groupId, setGroupId] = useState<string | null>(null);
  const selected = groups.find((group) => group.id === groupId) ?? groups.find((group) => group.isActive) ?? groups[0];

  return (
    <section className="surface-card">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-blue-100 text-blue-700"><UserRound size={23} aria-hidden="true" /></span>
        <div>
          <p className="text-sm font-semibold text-slate-500">AI 러닝크루 멤버</p>
          <h2 className="text-xl font-extrabold">{selected?.isActive ? "내 이름을 선택해주세요" : `${selected?.name ?? "이전 기수"} 멤버`}</h2>
        </div>
      </div>
      <div className="mt-5 flex gap-2" role="tablist" aria-label="참가 기수">
        {groups.map((group, index) => (
          <button
            key={group.id} id={`crew-tab-${group.id}`} role="tab" type="button"
            aria-selected={selected?.id === group.id} aria-controls={`crew-panel-${group.id}`}
            tabIndex={selected?.id === group.id ? 0 : -1}
            className={`filter-button flex-1 justify-center ${selected?.id === group.id ? "!border-blue-600 !bg-blue-600 !text-white" : ""}`}
            onClick={() => setGroupId(group.id)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === "ArrowRight") next = (index + 1) % groups.length;
              else if (event.key === "ArrowLeft") next = (index + groups.length - 1) % groups.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = groups.length - 1;
              else return;
              event.preventDefault();
              setGroupId(groups[next].id);
              document.getElementById(`crew-tab-${groups[next].id}`)?.focus();
            }}
          >{group.name}<span className="text-xs opacity-75">{group.members.length}명</span></button>
        ))}
      </div>
      {selected && <div id={`crew-panel-${selected.id}`} role="tabpanel" aria-labelledby={`crew-tab-${selected.id}`} className="mt-4">
        {!selected.isActive && <p className="mb-4 text-sm text-slate-500">함께했던 {selected.name} 멤버들이에요.</p>}
        <ul className="grid gap-3">
          {selected.members.map((person) => {
            const content = <>
              <span className="avatar shrink-0" aria-hidden="true">{person.name.slice(0, 1)}</span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block font-bold">{person.name}</span>
                {person.affiliation && <span className="mt-1 block break-words text-sm font-normal text-slate-500">{person.affiliation}</span>}
              </span>
              {person.selectable && <ArrowRight size={19} aria-hidden="true" />}
            </>;
            return <li key={person.id}>{person.selectable
              ? <button className="participant-button w-full" type="button" onClick={() => onChoose(person.id)}>{content}</button>
              : <div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4">{content}</div>}
            </li>;
          })}
        </ul>
        {selected.members.length === 0 && <p className="py-6 text-center text-sm text-slate-500">등록된 멤버가 없습니다.</p>}
      </div>}
    </section>
  );
}

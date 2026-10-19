import { kstDateKey } from "@/lib/time";
import { AiError, FIELDS, type AiState, type Card, type Field, type Message, type Room } from "./types";
export const DAY = 86_400_000;
export const expiry = (now: string, days = 7) => new Date(Date.parse(now) + days * DAY).toISOString();
export const purposeKey = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
export function prune(input: AiState, now: string): AiState {
  const state = structuredClone(input);
  const live = (s: { expiresAt: string }) => s.expiresAt > now;
  state.rooms = state.rooms.map(r => {
    const messages = r.messages.filter(live);
    const ids = new Set(messages.map(m => m.id));
    return { ...r, title: messages[0]?.text.slice(0,50) ?? "대화", messages, summaries: r.summaries.filter(s => live(s) && s.sources.every(id => ids.has(id))) };
  }).filter(r => r.messages.length > 0);
  state.drafts = state.drafts.filter(live);
  state.recommendations = state.recommendations.filter(live);
  state.purposes = state.purposes.filter(p => Date.parse(p.at) > Date.parse(now) - 30 * DAY);
  const cardIds = new Set([...state.rooms.flatMap(r => r.messages.flatMap(m => m.cards)), ...state.recommendations.flatMap(b => b.cards), ...state.saved].map(c => c.id));
  state.feedback = Object.fromEntries(Object.entries(state.feedback).filter(([id]) => cardIds.has(id)));
  return state;
}
export function summarize(room: Room, now: string): void {
  // Extractive summaries need no extra Gemini calls. Rebuild only changed days;
  // never renew an unchanged summary's creation date.
  const groups = new Map<string, Message[]>();
  for (const m of room.messages) {
    const date = kstDateKey(m.createdAt);
    groups.set(date, [...(groups.get(date) ?? []), m]);
  }
  room.summaries = [...groups].map(([date, messages]) => {
    const sources = messages.map(m => m.id);
    const old = room.summaries.find(s => s.date === date && s.sources.join() === sources.join());
    return old ?? { date, sources, text: messages.map(m => m.role + ": " + m.text.slice(0, 240)).join("\n").slice(0, 1600), createdAt: now, expiresAt: expiry(now) };
  });
}
export function context(room?: Room): string {
  if (!room) return "";
  const recent = room.messages.slice(-8);
  const ids = new Set(recent.map(m => m.id));
  return [...room.summaries.filter(s => !s.sources.every(id => ids.has(id))).map(s => s.date + ": " + s.text),
    ...recent.map(m => m.role + ": " + m.text + "\n" + m.cards.map(c => c.prompt).join("\n"))].join("\n").slice(-24000);
}
export function recommendationFields(state: AiState): Field[] {
  const eligible = FIELDS.filter(f => !state.excluded.includes(f));
  if (!eligible.length) throw new AiError("NO_FIELDS", "추천할 분야를 하나 이상 남겨주세요.");
  const ranked = [...eligible].sort((a,b) => ((state.scores[b] ?? 0) + (state.interests.includes(b) ? 3 : 0)) - ((state.scores[a] ?? 0) + (state.interests.includes(a) ? 3 : 0)));
  const explore = eligible.filter(f => !ranked.slice(0,2).includes(f));
  const pool = explore.length ? explore : eligible;
  return [ranked[0], ranked[1] ?? ranked[0], pool[state.exploration % pool.length]];
}
export function applyFeedback(state: AiState, card: Card, value: "used" | "dislike" | "saved") {
  const weights = { used: 3, dislike: -3, saved: 1 };
  const previous = state.feedback[card.id];
  if (previous === value || (value === "saved" && previous)) return;
  for (const field of card.fields) state.scores[field] = Math.max(-30, Math.min(30, (state.scores[field] ?? 0) - (previous ? weights[previous] : 0) + weights[value]));
  state.feedback[card.id] = value;
}
export function findCard(state: AiState, id: string): Card {
  const card = [...state.saved, ...state.recommendations.flatMap(b => b.cards), ...state.rooms.flatMap(r => r.messages.flatMap(m => m.cards))].find(c => c.id === id);
  if (!card) throw new AiError("NOT_FOUND", "만료되었거나 삭제된 프롬프트입니다.", 404);
  return card;
}
export function remainingReset(now: string) {
  return new Date(Date.parse(kstDateKey(now) + "T00:00:00+09:00") + DAY).toISOString();
}

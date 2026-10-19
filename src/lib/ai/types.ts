export const FIELDS = ["문서 작성", "업무 정리", "학습", "창작", "생활", "데이터 분석"] as const;
export type Field = typeof FIELDS[number];
export type Card = { id: string; title: string; prompt: string; fields: Field[]; purpose: string; source?: "personal" | "explore"; savedId?: string };
export type Message = { id: string; role: "user" | "assistant"; text: string; cards: Card[]; suggestions: string[]; createdAt: string; expiresAt: string };
export type Summary = { date: string; text: string; sources: string[]; createdAt: string; expiresAt: string };
export type Room = { id: string; title: string; updatedAt: string; messages: Message[]; summaries: Summary[] };
export type Saved = Card & { createdAt: string; updatedAt: string; version: number };
export type Draft = { cardId: string; text: string; version: number; createdAt: string; expiresAt: string };
export type Batch = { id: string; createdAt: string; expiresAt: string; cards: Card[] };
export type AiState = {
  rooms: Room[]; saved: Saved[]; drafts: Draft[]; recommendations: Batch[];
  interests: Field[]; excluded: Field[]; scores: Partial<Record<Field, number>>; exploration: number;
  purposes: { key: string; at: string }[]; feedback: Record<string, "used" | "dislike" | "saved">;
};
export type Settings = { enabled: boolean; recommendLimit: number; chatLimit: number; dailyCap: number; minuteCap: number };
export const DEFAULT_SETTINGS: Settings = { enabled: true, recommendLimit: 3, chatLimit: 5, dailyCap: 100, minuteCap: 5 };
export type RequestKind = "recommend" | "chat";
export type RequestStatus = "running" | "success" | "cancelled" | "failed";
export type AiRequest = { id: string; participantId: number; kind: RequestKind; status: RequestStatus; startedAt: string; expiresAt: string; day: string; resultId?: string; replay?: boolean };
export type Snapshot = { state: AiState; version: number; requests: AiRequest[]; settings: Settings; now: string; demo: boolean; configured: boolean };
export function emptyState(): AiState {
  return { rooms: [], saved: [], drafts: [], recommendations: [], interests: [], excluded: [], scores: {}, exploration: 0, purposes: [], feedback: {} };
}
export class AiError extends Error {
  constructor(public code: string, message: string, public status = 400, public details?: unknown) { super(message); }
}

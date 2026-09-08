import type { DailyStatus } from "./types";

export type HabitDay = { date: string; status: DailyStatus };
export type DailyMission = { id: string; date: string; title: string; prompt: string };

export function weekDates(today: string): string[] {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date);
    day.setUTCDate(day.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

export function recentMisses(days: HabitDay[]): number {
  let count = 0;
  for (const day of [...days].sort((a, b) => b.date.localeCompare(a.date))) {
    if (day.status === "completed") break;
    if (day.status === "missed") count += 1;
  }
  return count;
}

const starters = [
  ["보낼 메시지 한 번 다듬기", "다음 메시지를 상대가 이해하기 쉽게, 정중하고 간결하게 고쳐줘. 원래 의미는 유지해줘. 메시지: [개인정보를 뺀 문장]"],
  ["낯선 개념 하나 이해하기", "[궁금한 개념]을 처음 접하는 사람에게 일상 속 비유와 예시 하나로 설명해줘. 마지막에 내가 이해했는지 확인할 질문 하나를 해줘."],
  ["오늘 할 일 순서 정하기", "오늘 할 일은 [할 일 목록]이야. 사용할 수 있는 시간은 [시간]이야. 우선순위를 정하고, 바로 시작할 수 있는 첫 행동을 알려줘."],
  ["긴 글을 세 줄로 줄이기", "다음 글의 핵심을 세 줄로 요약하고, 내가 할 일을 따로 정리해줘. 글에 없는 내용은 추가하지 마. 글: [공개 가능한 내용]"],
  ["아이디어 세 가지 얻기", "[일상이나 업무에서 해결하고 싶은 작은 문제]에 대해 오늘 바로 시도할 수 있는 방법 세 가지를 제안해줘. 비용과 준비가 적게 드는 순서로 알려줘."],
  ["AI에게 질문을 되물어보기", "나는 [해보고 싶은 일]을 하려고 해. 더 좋은 답을 위해 필요한 질문을 하나씩 해줘. 내가 답하면 다음 질문으로 넘어가줘."],
  ["답변을 한 번 더 개선하기", "앞서 준 답변에서 모호하거나 실제로 적용하기 어려운 부분을 찾아줘. 그 부분을 구체적인 예시로 바꿔서 다시 작성해줘."],
];

export function starterMission(date: string): DailyMission {
  const timestamp = new Date(`${date}T00:00:00Z`).getTime();
  const index = Number.isFinite(timestamp) ? ((Math.floor(timestamp / 86400000) % starters.length) + starters.length) % starters.length : 0;
  const [title, prompt] = starters[index];
  return { id: "starter", date, title, prompt };
}

export function isPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && (
      url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" ||
      url.hostname === "web.push.apple.com" || url.hostname.endsWith(".notify.windows.com")
    );
  } catch { return false; }
}

export const KST_TIME_ZONE = "Asia/Seoul";
export const SUBMISSION_CUTOFF_SECONDS = 23 * 60 * 60 + 60;

type KstParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: KST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function getKstParts(input: Date | string | number = new Date()): KstParts {
  const date = input instanceof Date ? input : new Date(input);
  const values = Object.fromEntries(
    partsFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

export function kstDateKey(input: Date | string | number = new Date()): string {
  const { year, month, day } = getKstParts(input);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function kstSeconds(input: Date | string | number = new Date()): number {
  const { hour, minute, second } = getKstParts(input);
  return hour * 3600 + minute * 60 + second;
}

export function isSubmissionOnTime(input: Date | string | number): boolean {
  return kstSeconds(input) < SUBMISSION_CUTOFF_SECONDS;
}

export function isMissConfirmed(input: Date | string | number = new Date()): boolean {
  return kstSeconds(input) >= SUBMISSION_CUTOFF_SECONDS;
}

export function canParticipantEdit(
  submittedAt: Date | string | number,
  now: Date | string | number = new Date(),
): boolean {
  return kstDateKey(submittedAt) === kstDateKey(now) && isSubmissionOnTime(now);
}

export function secondsUntilCutoff(now: Date | string | number = new Date()): number {
  return Math.max(0, SUBMISSION_CUTOFF_SECONDS - kstSeconds(now));
}

export function formatRemainingUntilCutoff(now: Date | string | number = new Date()): string | null {
  const remaining = secondsUntilCutoff(now);
  if (remaining <= 0) return null;
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  if (minutes > 0) return `${minutes}분`;
  return "1분 미만";
}

export function kstDateRange(dateKey: string): { start: string; end: string } {
  const [year, month, day] = dateKey.split("-").map(Number);
  const startMs = Date.UTC(year, month - 1, day) - 9 * 60 * 60 * 1000;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function monthDateRange(monthKey: string): { start: string; end: string } {
  const [year, month] = monthKey.split("-").map(Number);
  const startMs = Date.UTC(year, month - 1, 1) - 9 * 60 * 60 * 1000;
  const endMs = Date.UTC(year, month, 1) - 9 * 60 * 60 * 1000;
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() };
}

export function dateKeysInMonth(monthKey: string): string[] {
  const [year, month] = monthKey.split("-").map(Number);
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) =>
    `${year}-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
  );
}

export function dateKeysBetween(startKey: string, endKey: string): string[] {
  const [sy, sm, sd] = startKey.split("-").map(Number);
  const [ey, em, ed] = endKey.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  const result: string[] = [];
  for (let cursor = start; cursor <= end; cursor += 86_400_000) {
    const date = new Date(cursor);
    result.push(
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
        date.getUTCDate(),
      ).padStart(2, "0")}`,
    );
  }
  return result;
}

export function isWeekend(dateKey: string): boolean {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function formatKstTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

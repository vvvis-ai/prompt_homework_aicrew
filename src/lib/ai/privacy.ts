export type Finding = { start: number; end: number; label: string; risk: "high" | "warning" };
const patterns: { pattern: RegExp; label: string; risk: Finding["risk"] }[] = [
  { pattern: /\b\d{6}[- ]?[1-8]\d{6}\b/g, label: "주민등록번호", risk: "high" },
  { pattern: /(?:AIza[\w-]{25,}|sk[-_][\w-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/g, label: "비밀키", risk: "high" },
  { pattern: /(?:비밀번호|password|passwd|api[_ -]?key|secret)\s*[:=]\s*[^\s,;]{4,}/gi, label: "인증정보", risk: "high" },
  { pattern: /\b(?:\d[ -]?){13,19}\b/g, label: "금융·식별번호", risk: "high" },
  { pattern: /\b01[016789][- .]?\d{3,4}[- .]?\d{4}\b/g, label: "전화번호", risk: "warning" },
  { pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, label: "이메일", risk: "warning" },
  { pattern: /(?:계좌(?:번호)?|여권(?:번호)?)\s*[:：]?\s*[A-Z0-9-]{6,}/gi, label: "계좌·여권", risk: "high" },
  { pattern: /(?:성명|이름|주소)\s*[:：]\s*[^\n,;]{2,60}/g, label: "이름·주소", risk: "warning" },
];
export function inspectPrivacy(text: string): Finding[] {
  const findings = patterns.flatMap(({ pattern, label, risk }) =>
    Array.from(text.matchAll(new RegExp(pattern.source, pattern.flags)), m => ({ start: m.index!, end: m.index! + m[0].length, label, risk })));
  return findings.sort((a, b) => a.start - b.start || b.end - a.end).filter((f, i, all) => !all.slice(0, i).some(p => p.start <= f.start && p.end >= f.end));
}
export function anonymize(text: string, findings = inspectPrivacy(text)): string {
  let result = text;
  for (const f of [...findings].sort((a, b) => b.start - a.start)) result = result.slice(0, f.start) + "[" + f.label + " 삭제]" + result.slice(f.end);
  return result;
}

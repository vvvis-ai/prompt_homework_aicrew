export const SHARED_LINK_REQUIRED_MESSAGE = "‘share’ 또는 ‘/notebook/’이 포함된 링크를 입력해주세요. ‘공유방법’을 확인한 뒤 링크를 붙여넣어주세요.";

export function getSubmissionUrlError(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "http 또는 https로 시작하는 정상적인 링크를 입력해주세요.";
    }
    const normalized = value.trim().toLowerCase();
    return normalized.includes("share") || normalized.includes("/notebook/") ? null : SHARED_LINK_REQUIRED_MESSAGE;
  } catch {
    return "http 또는 https로 시작하는 정상적인 링크를 입력해주세요.";
  }
}

export function normalizeUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("http 또는 https 주소만 등록할 수 있습니다.");
  }
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";
  if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
    parsed.port = "";
  }
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}


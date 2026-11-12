export const SHARED_LINK_REQUIRED_MESSAGE = "AI 공유 링크 또는 Netlify, Cloudflare 등에서 배포한 웹사이트 주소를 입력해주세요.";

// Default public deployment domains; add new providers here as they are supported.
const DEPLOYMENT_DOMAINS = ["netlify.app", "pages.dev", "workers.dev", "vercel.app", "github.io", "onrender.com"];

export function isDeploymentUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    return DEPLOYMENT_DOMAINS.some((domain) => hostname.endsWith(`.${domain}`) && hostname.length > domain.length + 1);
  } catch {
    return false;
  }
}

export function getWebsitePreviewSandbox(value: string, pageOrigin: string): string {
  return new URL(value).origin === pageOrigin ? "allow-scripts" : "allow-scripts allow-same-origin";
}

export function getSubmissionUrlError(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "http 또는 https로 시작하는 정상적인 링크를 입력해주세요.";
    }
    const normalized = value.trim().toLowerCase();
    return normalized.includes("share") || normalized.includes("/notebook/") || isDeploymentUrl(value) ? null : SHARED_LINK_REQUIRED_MESSAGE;
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


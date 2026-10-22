export const MAX_HTML_BYTES = 2 * 1024 * 1024;

export function htmlFileError(file: { name: string; size: number }): string | null {
  if (!/\.html?$/i.test(file.name)) return ".html 또는 .htm 파일을 선택해주세요.";
  if (file.name.length > 180) return "파일 이름은 180자 이하로 줄여주세요.";
  if (file.size === 0) return "빈 파일은 등록할 수 없습니다.";
  if (file.size > MAX_HTML_BYTES) return "HTML 파일은 2MB 이하로 등록해주세요.";
  return null;
}

export const submissionDetailUrl = (id: string | number) => `/submissions/${id}`;
export const submissionPreviewUrl = (id: string | number) => `/api/submissions/${id}/html`;

// A response header (not a meta tag) keeps the document isolated even when
// someone opens the preview URL directly. Never add allow-same-origin.
export const HTML_PREVIEW_CSP = [
  "sandbox allow-scripts",
  "default-src 'none'",
  "script-src 'unsafe-inline' https:",
  "style-src 'unsafe-inline' https:",
  "img-src data: https:",
  "font-src data: https:",
  "media-src data: https:",
  "connect-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join("; ");

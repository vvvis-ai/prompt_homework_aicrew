import { htmlFileError, MAX_HTML_BYTES } from "@/lib/html-submission";

export class SubmissionInputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// Bound the stream itself; Content-Length is optional and cannot be trusted.
export async function readSubmissionInput(request: Request) {
  const limit = MAX_HTML_BYTES + 64 * 1024;
  const reader = request.body?.getReader();
  if (!reader) throw new SubmissionInputError("입력 내용을 확인해주세요.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new SubmissionInputError("HTML 파일은 2MB 이하로 등록해주세요.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const body = new Response(bytes, { headers: { "Content-Type": request.headers.get("Content-Type") ?? "application/json" } });
  if (!request.headers.get("Content-Type")?.startsWith("multipart/form-data")) {
    return { fields: await body.json().catch(() => null), html: null };
  }
  const form = await body.formData().catch(() => { throw new SubmissionInputError("파일 업로드 형식을 확인해주세요."); });
  const files = form.getAll("file");
  const file = files[0];
  if (files.length !== 1 || !(file instanceof File)) throw new SubmissionInputError("HTML 파일 한 개를 선택해주세요.");
  const error = htmlFileError(file);
  if (error) throw new SubmissionInputError(error, file.size > MAX_HTML_BYTES ? 413 : 400);
  let content: string;
  try { content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
  catch { throw new SubmissionInputError("UTF-8 형식으로 저장한 HTML 파일을 선택해주세요."); }
  if (!content.trim() || content.includes("\0") || !/<(?:!doctype\s+html|html|head|body|div|main|section|h[1-6]|p|script|style)\b/i.test(content)) {
    throw new SubmissionInputError("HTML 내용이 있는 웹페이지 파일을 선택해주세요.");
  }
  if (new TextEncoder().encode(content).byteLength > MAX_HTML_BYTES) throw new SubmissionInputError("HTML 파일은 2MB 이하로 등록해주세요.", 413);
  return {
    fields: Object.fromEntries([...form.entries()].filter(([key]) => key !== "file")),
    html: { name: file.name, content },
  };
}

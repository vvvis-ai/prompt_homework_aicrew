import { it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { generate } from "@/server/ai/gemini";

it("실제 Gemini 응답·스트리밍·프롬프트 카드 형식", async () => {
  if (process.env.RUN_GEMINI_LIVE !== "true") throw new Error("npm run test:gemini-live 명령으로만 실행해주세요.");
  const started = Date.now();
  let previews = 0, attempts = 0;
  const statuses: number[] = [];
  const originalFetch = globalThis.fetch;
  const observer = vi.spyOn(globalThis, "fetch").mockImplementation(async (...args) => {
    const response = await originalFetch(...args);
    statuses.push(response.status);
    return response;
  });
  try {
    const result = await generate({
      instruction: "한국어로 짧게 답하세요. text는 한 문장, cards는 정확히 1개, suggestions는 개선 요청 1개로 작성하세요. 개인정보를 사용하지 마세요.",
      input: "가상의 독서 모임에서 책의 핵심을 세 문장으로 요약하도록 돕는 짧은 프롬프트를 만들어주세요. 분야는 학습입니다.",
      signal: AbortSignal.timeout(75000),
      onPreview: text => { if (text.trim()) previews++; },
      beforeAttempt: async () => { attempts++; },
    });
    if (!result.text.trim() || result.cards.length !== 1 || !result.cards[0].prompt.trim() || previews === 0) {
      throw new Error("LIVE_RESULT_FORMAT");
    }
    console.log(JSON.stringify({
      result: "PASS", model: process.env.GEMINI_MODEL, httpStatuses: statuses,
      attempts, elapsedMs: Date.now() - started, previewEvents: previews,
      cards: result.cards.length, suggestions: result.suggestions.length,
      promptCharacters: result.cards[0].prompt.length,
    }));
  } catch (error) {
    // Never expose raw network exceptions, request headers, keys, or model output.
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Z_]{1,40}$/.test(error.code) ? error.code : "LIVE_TEST_FAILED";
    throw new Error(`${code}; HTTP=${statuses.join(",") || "응답 없음"}; attempts=${attempts}`);
  } finally {
    observer.mockRestore();
  }
});

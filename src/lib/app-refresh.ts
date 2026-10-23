import type { AppData } from "@/lib/types";

export const APP_SEARCH_MAX_LENGTH = 100;

class AppRefreshError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

function retryDelay(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, 500);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

// All refresh paths share the same bounded retry and cancellation handling.
export async function fetchAppData(params: URLSearchParams, signal?: AbortSignal): Promise<AppData> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try {
      const response = await fetch(`/api/app?${params}`, { cache: "no-store", signal });
      if (!response.ok) {
        throw new AppRefreshError(
          response.status === 400
            ? "조회 조건을 확인해주세요. 날짜를 다시 선택하고 검색어는 100자 이내로 입력해주세요."
            : "데이터를 새로 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
          response.status >= 500,
        );
      }
      const result = await response.json() as AppData;
      signal?.throwIfAborted();
      return result;
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof Error && error.name === "AbortError") throw error;
      if (attempt === 0 && (!(error instanceof AppRefreshError) || error.retryable)) {
        await retryDelay(signal);
        continue;
      }
      if (error instanceof AppRefreshError) throw error;
      throw new Error("연결이 원활하지 않아 데이터를 새로 불러오지 못했습니다. 다시 시도해주세요.");
    }
  }
}

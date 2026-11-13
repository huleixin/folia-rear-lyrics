// src/services/search/searchRequestBudget.ts
// Bound UI waiting even when a provider ignores cancellation; callers retain their request-generation fences.
export const SEARCH_REQUEST_TIMEOUT_MS = 15_000;
export const SUGGEST_REQUEST_TIMEOUT_MS = 5_000;

export async function searchRequestBudget<T>(
    task: (signal: AbortSignal) => Promise<T>,
    timeoutMs = SEARCH_REQUEST_TIMEOUT_MS,
    signal?: AbortSignal,
): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: () => void = () => {};
    const budget = new Promise<never>((_resolve, reject) => {
        abort = () => {
            reject(new DOMException('Search cancelled', 'AbortError'));
            controller.abort();
        };
        if (signal?.aborted) { abort(); return; }
        signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => {
            reject(new Error('搜索请求超时，请重试'));
            controller.abort();
        }, timeoutMs);
    });
    try {
        return await Promise.race([budget, controller.signal.aborted
            ? budget : task(controller.signal)]);
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
    }
}

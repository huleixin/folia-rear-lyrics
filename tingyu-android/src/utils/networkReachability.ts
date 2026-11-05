// src/utils/networkReachability.ts
/**
 * 断网判定与超时保护。
 *
 * 本地音乐模式要求「完全断网也能用」，但本地歌的歌词/封面自动匹配是要联网的。
 * 断网时那些请求会一直挂着（原生 http 的读超时是 45 秒），表现就是点开一首歌
 * 停在「正在匹配歌词和封面」很久 —— 明明歌在本地、封面和歌词也在本地。
 */

/** 明显没有网络时返回 false。`navigator.onLine` 为 true 不代表真的能连通（门户 WiFi 就是这样）。 */
export const isNetworkOnline = (): boolean => {
    if (typeof navigator === 'undefined') return true;
    if (typeof navigator.onLine !== 'boolean') return true;
    return navigator.onLine;
};

/**
 * 给一个 Promise 加超时；超时返回 fallback。
 *
 * 只用来包「可以放弃」的事（自动匹配歌词封面），不能包播放本身。
 */
export const withTimeout = async <T>(
    promise: Promise<T>,
    timeoutMs: number,
    fallback: T,
): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>(resolve => {
                timer = setTimeout(() => resolve(fallback), timeoutMs);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

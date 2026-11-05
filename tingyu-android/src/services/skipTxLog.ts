// src/services/skipTxLog.ts
// 切歌事务的 JS 侧时间线（与原生 TingyuSkipTx 同一套事件名）。
//
// 用途：回答三个问题 ——
//   1. 封面究竟领先真实歌曲身份多少毫秒？（SKIP_REQUEST → ENGINE_TRACK_CHANGED / UI_TRACK_CONFIRMED）
//   2. 歌曲身份更新究竟领先实际播放多少毫秒？（身份确认 → AUDIO_PLAYING / ENGINE isPlaying）
//   3. 延迟主要来自 JS 调度、音源解析、Media3 缓冲还是 Compose 状态更新？
//      （JS_ACTION_RECEIVED → AUDIO_RESOLVE_START → AUDIO_SOURCE_READY → AUDIO_PLAYING 各段相减）
//
// requestId：原生发起的手势/按钮切歌把单调编号编码在命令 value 里带过来（value > 0）；
// 队列点播、自动续播等 JS 自己发起的切歌没有 requestId，记 -1（对齐靠歌曲 key 与时间戳）。
//
// 隐私：只记歌曲 key 的短前缀与耗时；音源 URL、Cookie、Token 一律不进日志。

export type SkipTxEvent =
    | 'SKIP_REQUEST'
    | 'JS_ACTION_RECEIVED'
    | 'AUDIO_RESOLVE_START'
    | 'AUDIO_SOURCE_READY'
    | 'AUDIO_PLAYING'
    | 'COVER_ANIMATION_DONE'
    | 'SKIP_FAILED';

const enabled = (): boolean => true;

const mono = (): number =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? Math.round(performance.now())
        : -1;

/** 最近一次从原生命令桥带来的 requestId。手势切歌后 playSong 会引用它做对齐。 */
let lastNativeRequestId = -1;

export const noteNativeRequestId = (requestId: number): void => {
    if (Number.isFinite(requestId) && requestId > 0) lastNativeRequestId = requestId;
};

export const currentNativeRequestId = (): number => lastNativeRequestId;

/** 测试隔离：把 requestId 通道恢复到"没有原生命令"的初始态。 */
export const resetSkipTxForTests = (): void => {
    lastNativeRequestId = -1;
};

const short = (key: string): string => (key.length <= 12 ? key : `${key.slice(0, 12)}..`);

export const logSkipTx = (
    event: SkipTxEvent,
    songKey: string,
    detail: Record<string, string | number | boolean> = {},
): void => {
    if (!enabled()) return;
    const requestId = lastNativeRequestId;
    const fields = Object.entries(detail)
        .map(([name, value]) => `${name}=${value}`)
        .join(' ');
    console.info(
        `[skip-tx] ${event} id=${requestId} song=${short(songKey)}${fields ? ` ${fields}` : ''} ` +
            `atPerfMs=${mono()} atWall=${Date.now()}`,
    );
};

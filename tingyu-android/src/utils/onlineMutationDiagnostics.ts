// src/utils/onlineMutationDiagnostics.ts
// 在线写入（红心 / 收藏歌单 / 收藏专辑 / 加删歌）的失败留痕。
//
// 现场教训：这些写入失败时，诊断里只有一句「收藏失败」—— 因为要么在 provider 里被**提前拒绝**
// （缺 songmid / tid / mid 时一个请求都不发），要么请求发出去了、错误被桥吞掉。两种情况在报告里
// 长得一样。这里按「哪家 provider、哪个操作、哪个条目、什么原因」记一条，报告里单列一段。

export type OnlineMutationRecord = {
    at: number;
    providerId: string;
    operation: string;
    mediaId: string;
    reason: string;
};

const MAX_RECORDS = 24;
const MAX_AGE_MS = 15 * 60 * 1000;
const records: OnlineMutationRecord[] = [];

const text = (value: unknown, fallback = ''): string => {
    if (value === undefined || value === null) return fallback;
    const result = String(value).trim();
    return result || fallback;
};

/** 错误信息里可能带后端回包；压成一行、截断，避免报告被一条错误撑爆。 */
const describeReason = (error: unknown): string => {
    if (error && typeof error === 'object') {
        const candidate = error as { code?: unknown; message?: unknown };
        const code = text(candidate.code);
        const message = text(candidate.message, String(error));
        return text(code ? `${code}: ${message}` : message, 'unknown error').slice(0, 200);
    }
    return text(error, 'unknown error').slice(0, 200);
};

export const noteOnlineMutationFailure = (input: {
    providerId: string;
    operation: string;
    mediaId?: string | number;
    error: unknown;
}): void => {
    const at = Date.now();
    while (records.length > 0 && at - records[0].at > MAX_AGE_MS) records.shift();
    records.push({
        at,
        providerId: text(input.providerId, 'unknown').slice(0, 24),
        operation: text(input.operation, 'unknown').slice(0, 48),
        mediaId: text(input.mediaId).slice(0, 80),
        reason: describeReason(input.error),
    });
    if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
};

export const getOnlineMutationDiagnosticLines = (): string[] => {
    const at = Date.now();
    while (records.length > 0 && at - records[0].at > MAX_AGE_MS) records.shift();
    return records.map((record) => (
        `mutation +${Math.max(0, at - record.at)}ms ago provider=${record.providerId}`
        + ` operation=${record.operation} mediaId=${record.mediaId || '(none)'}`
        + ` reason=${record.reason}`
    ));
};

export const resetOnlineMutationDiagnostics = (): void => {
    records.length = 0;
};

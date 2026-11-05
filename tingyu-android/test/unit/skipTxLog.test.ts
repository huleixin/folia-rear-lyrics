import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    currentNativeRequestId,
    logSkipTx,
    noteNativeRequestId,
    resetSkipTxForTests,
} from '../../src/services/skipTxLog';

// test/unit/skipTxLog.test.ts
// 切歌时间线的 requestId 通道：原生命令 value > 0 时被记录，JS 侧后续事件共用它对齐。
describe('skipTxLog', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        resetSkipTxForTests();
    });

    it('records a native requestId from the command value', () => {
        expect(currentNativeRequestId()).toBe(-1);
        noteNativeRequestId(42);
        expect(currentNativeRequestId()).toBe(42);
    });

    it('ignores non-positive and non-finite values', () => {
        noteNativeRequestId(0);
        expect(currentNativeRequestId()).toBe(-1);
        noteNativeRequestId(Number.NaN);
        expect(currentNativeRequestId()).toBe(-1);
    });

    it('logs the timeline without throwing and never emits URLs or tokens', () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        expect(() =>
            logSkipTx('AUDIO_SOURCE_READY', 'qq:mid_0000123456789', { channel: 'online', kind: 'blob' }),
        ).not.toThrow();
        expect(info).toHaveBeenCalledTimes(1);
        const line = info.mock.calls[0][0] as string;
        expect(line).toContain('AUDIO_SOURCE_READY');
        expect(line).toContain('id=-1');
        // 身份只保留 12 字符短前缀
        expect(line).toContain('qq:mid_00001..');
        expect(line).not.toContain('http');
    });
});

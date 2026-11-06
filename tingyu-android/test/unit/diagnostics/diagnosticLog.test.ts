import { beforeEach, describe, expect, it } from 'vitest';
import {
    clearDiagnosticEvents,
    diagnosticEvent,
    diagnosticEventCount,
    exportDiagnosticEventsJsonl,
    readDiagnosticEvents,
} from '../../../src/services/diagnostics/diagnosticLog';

// test/unit/diagnostics/diagnosticLog.test.ts
// 前端统一事件流的三条底线：
//  1) 有界：超过 400 条丢最旧，不允许无限增长；
//  2) 脱敏：敏感键与对象/数组字段不落盘；
//  3) 可解析：每一行都是合法 JSON，字段齐全（t/m/l/e）。
// 节流也会被验证，但用独立事件名，避免与其它用例互相干扰。

describe('diagnosticLog', () => {
    beforeEach(() => clearDiagnosticEvents());

    it('保留最近 400 条，丢弃最旧的', () => {
        for (let index = 0; index < 450; index += 1) {
            diagnosticEvent('ui', 'warn', `evt-${index}`, { index });
        }
        expect(diagnosticEventCount()).toBe(400);
        const events = readDiagnosticEvents();
        expect(events[0].e).toBe('evt-50');
        expect(events[events.length - 1].e).toBe('evt-449');
    });

    it('同一事件一秒内只记一条（info/debug 节流）', () => {
        diagnosticEvent('ui', 'info', 'throttle-probe');
        diagnosticEvent('ui', 'info', 'throttle-probe');
        diagnosticEvent('ui', 'info', 'throttle-probe');
        const hits = readDiagnosticEvents().filter((event) => event.e === 'throttle-probe');
        expect(hits).toHaveLength(1);
    });

    it('warn 及以上不节流', () => {
        diagnosticEvent('ui', 'warn', 'always-on-probe');
        diagnosticEvent('ui', 'warn', 'always-on-probe');
        const hits = readDiagnosticEvents().filter((event) => event.e === 'always-on-probe');
        expect(hits).toHaveLength(2);
    });

    it('丢弃敏感键', () => {
        diagnosticEvent('source', 'info', 'provider-result', {
            provider: 'qq',
            code: -1,
            token: 'secret',
            cookie: 'sid=1',
            uin: '10001',
            email: 'a@b.c',
            audioUrl: 'https://example.com/a.mp3',
            lyric: '整首歌词',
        });
        const [event] = readDiagnosticEvents();
        expect(event.f).toEqual({ provider: 'qq', code: -1 });
    });

    it('截断过长字符串', () => {
        diagnosticEvent('ui', 'warn', 'long-text', { message: 'x'.repeat(400) });
        const [event] = readDiagnosticEvents();
        const message = String(event.f?.message ?? '');
        expect(message.length).toBeLessThanOrEqual(241);
        expect(message.endsWith('…')).toBe(true);
    });

    it('导出的 JSONL 每一行都能解析且字段齐全', () => {
        diagnosticEvent('nav', 'info', 'page-enter:settings', { sinceTapMs: 128 });
        diagnosticEvent('playback', 'warn', 'online-media-error', { code: 4 });
        const lines = exportDiagnosticEventsJsonl().split('\n');
        expect(lines.length).toBe(2);
        for (const line of lines) {
            const parsed = JSON.parse(line);
            expect(typeof parsed.t).toBe('number');
            expect(typeof parsed.m).toBe('string');
            expect(['debug', 'info', 'warn', 'error', 'fatal']).toContain(parsed.l);
            expect(typeof parsed.e).toBe('string');
        }
    });
});

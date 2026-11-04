// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    installMinimalSourceToggle,
    minimalSourceBadgeEnabled,
    setMinimalSourceBadge,
    subscribeMinimalSourceBadge,
    MINIMAL_SOURCE_EVENT,
} from '@/services/minimalSourceDiagnostics';

// test/unit/minimalSourceDiagnostics.test.ts
// 「这一屏是谁画的」诊断开关。规则：默认关、写 localStorage、通知订阅者。

describe('minimal source diagnostics', () => {
    beforeEach(() => {
        localStorage.clear();
        delete (window as unknown as { __tingyuMinimalSource?: unknown }).__tingyuMinimalSource;
    });

    it('is off by default and round-trips through localStorage', () => {
        expect(minimalSourceBadgeEnabled()).toBe(false);
        setMinimalSourceBadge(true);
        expect(minimalSourceBadgeEnabled()).toBe(true);
        expect(localStorage.getItem('tingyu-minimal-source-badge')).toBe('1');
        setMinimalSourceBadge(false);
        expect(minimalSourceBadgeEnabled()).toBe(false);
    });

    it('notifies subscribers when the flag flips', () => {
        const seen = vi.fn();
        const stop = subscribeMinimalSourceBadge(seen);
        setMinimalSourceBadge(true);
        expect(seen).toHaveBeenCalledTimes(1);
        stop();
        setMinimalSourceBadge(false);
        expect(seen).toHaveBeenCalledTimes(1);
    });

    it('exposes one console toggle that flips and reports state', () => {
        installMinimalSourceToggle();
        const toggle = (window as unknown as { __tingyuMinimalSource: (on?: boolean) => string }).__tingyuMinimalSource;
        expect(typeof toggle).toBe('function');
        expect(toggle()).toContain('on');
        expect(minimalSourceBadgeEnabled()).toBe(true);
        expect(toggle(false)).toBe('off');
        expect(minimalSourceBadgeEnabled()).toBe(false);
        // 幂等：重复安装不覆盖。
        installMinimalSourceToggle();
        expect((window as unknown as { __tingyuMinimalSource: unknown }).__tingyuMinimalSource).toBe(toggle);
    });

    it('declares the event name the badge components listen for', () => {
        expect(MINIMAL_SOURCE_EVENT).toBe('tingyu-minimal-source-badge');
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

// test/unit/qishui/androidAvailability.test.ts
// 上游 0.7.22 的汽水只认 Electron 主进程桥；安卓壳里没有 Electron，判定必须仍然成立，否则整个
// 平台会从界面上消失（波点当年就是这样丢的）。

const loadTransport = () => import('@/services/onlineMusic/qishui/qishuiTransport');

afterEach(() => {
    vi.doUnmock('@/utils/platform');
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('Qishui availability', () => {
    it('reports configured inside the Android native shell, without an Electron bridge', async () => {
        vi.resetModules();
        vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true } });
        vi.doMock('@/utils/platform', () => ({ IS_ANDROID_WEBVIEW: true, isAndroidNativeRuntime: () => true }));
        try {
            const transport = await loadTransport();
            expect(transport.getQishuiAvailability()).toEqual({ configured: true });
        } finally {
            vi.doUnmock('@/utils/platform');
            vi.unstubAllGlobals();
            vi.resetModules();
        }
    });

    it('reports configured where the desktop preload bridge exists', async () => {
        vi.resetModules();
        vi.stubGlobal('window', { electron: { qishuiRequest: vi.fn() } });
        vi.doMock('@/utils/platform', () => ({ IS_ANDROID_WEBVIEW: false, isAndroidNativeRuntime: () => false }));
        try {
            const transport = await loadTransport();
            expect(transport.getQishuiAvailability()).toEqual({ configured: true });
        } finally {
            vi.doUnmock('@/utils/platform');
            vi.unstubAllGlobals();
            vi.resetModules();
        }
    });

    it('reports runtime-unavailable in a plain browser page', async () => {
        vi.resetModules();
        vi.stubGlobal('window', {});
        vi.doMock('@/utils/platform', () => ({ IS_ANDROID_WEBVIEW: false, isAndroidNativeRuntime: () => false }));
        try {
            const transport = await loadTransport();
            expect(transport.getQishuiAvailability()).toEqual({ configured: false, reason: 'runtime-unavailable' });
        } finally {
            vi.doUnmock('@/utils/platform');
            vi.unstubAllGlobals();
            vi.resetModules();
        }
    });
});

// @vitest-environment jsdom
import React, { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AndroidAppUpdateCard from '@/components/modal/AndroidAppUpdateCard';

vi.mock('@/services/nativeChrome', () => ({
    chromeNative: {
        isAvailable: () => false,
    },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

function setupFoliaNativeMock(initialStatus: Record<string, unknown>) {
    const getAppUpdateStatus = vi.fn().mockResolvedValue(initialStatus);
    const openBetaActivationDialog = vi.fn().mockResolvedValue(initialStatus);
    const setAppUpdateChannel = vi.fn().mockResolvedValue(initialStatus);
    const leaveBetaProgram = vi.fn().mockResolvedValue({
        ...initialStatus,
        channel: 'stable',
        betaAuthorized: false,
        betaRole: undefined,
    });
    const getTelemetryStatus = vi.fn().mockResolvedValue({ enabled: true, intervalSec: 60 });

    Object.defineProperty(window, 'Capacitor', {
        configurable: true,
        value: {
            getPlatform: () => 'android',
            Plugins: {
                FoliaNative: {
                    getAppUpdateStatus,
                    openBetaActivationDialog,
                    setAppUpdateChannel,
                    leaveBetaProgram,
                    getTelemetryStatus,
                },
            },
        },
    });

    return {
        getAppUpdateStatus,
        openBetaActivationDialog,
        setAppUpdateChannel,
        leaveBetaProgram,
    };
}

describe('AndroidAppUpdateCard private beta gating', () => {
    beforeEach(() => {
        host = document.createElement('div');
        document.body.append(host);
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
        delete (window as unknown as Record<string, unknown>).Capacitor;
        vi.clearAllMocks();
    });

    it('hides channel switcher and beta entries for ordinary users', async () => {
        setupFoliaNativeMock({
            currentVersionName: '1.5.84',
            currentVersionCode: 300,
            channel: 'stable',
            betaAuthorized: false,
            checkPhase: 'up_to_date',
            checkMessage: '当前已是最新版本',
            lastCheckedAtMs: Date.now(),
            decisionMode: 'none',
            forceUpdate: false,
        });

        await act(async () => {
            root.render(h(AndroidAppUpdateCard));
        });

        expect(host.textContent).not.toContain('正式通道');
        expect(host.textContent).not.toContain('测试通道');
        expect(host.textContent).not.toContain('退出内测资格');
        expect(host.textContent).not.toContain('内测资格');
    });

    it('opens native beta activation dialog after 7 consecutive taps on version card', async () => {
        const mocks = setupFoliaNativeMock({
            currentVersionName: '1.5.84',
            currentVersionCode: 300,
            channel: 'stable',
            betaAuthorized: false,
            checkPhase: 'up_to_date',
            checkMessage: '当前已是最新版本',
            lastCheckedAtMs: Date.now(),
            decisionMode: 'none',
            forceUpdate: false,
        });

        await act(async () => {
            root.render(h(AndroidAppUpdateCard));
        });

        const versionCard = host.querySelector('[data-testid="help-current-version-card"]');
        expect(versionCard).not.toBeNull();

        for (let i = 0; i < 4; i += 1) {
            await act(async () => {
                versionCard!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });
        }
        expect(host.textContent).not.toContain('再点击');
        expect(mocks.openBetaActivationDialog).not.toHaveBeenCalled();

        await act(async () => {
            versionCard!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(host.textContent).toContain('再点击 2 次打开内测激活');

        await act(async () => {
            versionCard!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(host.textContent).toContain('再点击 1 次打开内测激活');
        expect(mocks.openBetaActivationDialog).not.toHaveBeenCalled();

        await act(async () => {
            versionCard!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(host.textContent).toContain('正在打开内测激活窗口…');
        expect(mocks.openBetaActivationDialog).toHaveBeenCalledTimes(1);
    });

    it('renders channel switcher, role status, and leave confirmation for authorized beta users', async () => {
        const mocks = setupFoliaNativeMock({
            currentVersionName: '1.5.84',
            currentVersionCode: 300,
            channel: 'private_beta',
            betaAuthorized: true,
            betaRole: 'tester',
            betaExpiresAtMs: Date.now() + 10 * 24 * 3600 * 1000,
            checkPhase: 'up_to_date',
            checkMessage: '当前已是最新版本',
            lastCheckedAtMs: Date.now(),
            decisionMode: 'none',
            forceUpdate: false,
        });

        await act(async () => {
            root.render(h(AndroidAppUpdateCard));
        });

        expect(host.textContent).toContain('正式通道');
        expect(host.textContent).toContain('测试通道');
        expect(host.textContent).toContain('受邀内测设备授权');
        expect(host.textContent).toContain('退出内测资格');

        const leaveButton = Array.from(host.querySelectorAll('button')).find(b =>
            b.textContent?.includes('退出内测资格'),
        );
        expect(leaveButton).toBeDefined();

        await act(async () => {
            leaveButton!.click();
        });

        const confirmLeave = Array.from(host.querySelectorAll('button')).find(b =>
            b.textContent?.includes('确认退出'),
        );
        expect(confirmLeave).toBeDefined();

        await act(async () => {
            confirmLeave!.click();
        });

        expect(mocks.leaveBetaProgram).toHaveBeenCalledTimes(1);
    });
});

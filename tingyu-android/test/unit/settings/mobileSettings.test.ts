// @vitest-environment jsdom
import React, { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/i18n/locales/zh-CN';
import { rearSettingsCanToggle, rearSettingsHint, rearSettingsState } from '@/components/modal/settings/rearLyricsSettingsModel';
import AndroidRearLyricsSetting from '@/components/modal/settings/AndroidRearLyricsSetting';
import AndroidImmersiveSetting from '@/components/modal/settings/AndroidImmersiveSetting';
import MobileSettingsHeader from '@/components/modal/settings/MobileSettingsHeader';
import MobileSettingsNavigation from '@/components/modal/settings/navigation/MobileSettingsNavigation';
import SettingsSectionHeader from '@/components/modal/settings/SettingsSectionHeader';
import { buildSettingsNavGroups } from '@/components/modal/settings/navigation/settingsNavModel';
import { useAndroidLayoutSettingsStore } from '@/stores/useAndroidLayoutSettingsStore';
import type { RearLyricsStatus } from '@/services/rearLyricsControl';

// test/unit/settings/mobileSettings.test.ts
// DOM/action tests only: jsdom does not measure WebView layout, system bars or scrolling performance.
const bridge = vi.hoisted(() => ({ getRearLyricsStatus: vi.fn(), startRearLyrics: vi.fn(), returnFromRearLyrics: vi.fn(), setRearCoverSleep: vi.fn() }));
vi.mock('@/services/rearLyricsControl', () => ({ canUseRearLyrics: () => true, rearLyricsPlugin: () => bridge }));
vi.mock('@/services/androidPhoneLayout', () => ({
    applyAndroidPhoneFit: vi.fn(), syncAndroidPhoneFitNative: vi.fn(), readStoredAndroidPhoneFit: () => false,
    readStoredAndroidPhoneFitOrientation: () => 'portrait', writeStoredAndroidPhoneFit: vi.fn(), writeStoredAndroidPhoneFitOrientation: vi.fn(),
}));
vi.mock('@/services/androidKeepScreenOn', () => ({ applyKeepScreenOn: vi.fn(), readStoredKeepScreenOn: () => false, writeStoredKeepScreenOn: vi.fn() }));
const translate = (key: string, values?: Record<string, unknown>): string => {
    const text = key.split('.').reduce<unknown>((current, part) => current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined, zh);
    return String(text ?? key).replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? ''));
};
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement, status: RearLyricsStatus;
const storage = new Map<string, string>();
beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks(); storage.clear();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
    vi.stubGlobal('Capacitor', { getPlatform: () => 'android' });
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    status = { enabled: false, active: false, starting: false, rearDisplayId: 1, build: 250, shizukuAvailable: true, authorized: true };
    bridge.getRearLyricsStatus.mockImplementation(async () => ({ ...status }));
    bridge.startRearLyrics.mockImplementation(async () => { status = { ...status, enabled: true, active: true }; return { verified: true }; });
    bridge.returnFromRearLyrics.mockImplementation(async () => { status = { ...status, enabled: false, active: false }; });
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
    useAndroidLayoutSettingsStore.setState({ immersiveModeEnabled: false });
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const rear = () => h(AndroidRearLyricsSetting, { isDaylight: false, settingsCardClass: '', compact: true, onOpenGuide: vi.fn() });
const rearToggle = () => host.querySelector<HTMLButtonElement>('[role="switch"]')!;

describe('truthful rear-display settings', () => {
    it('separates pending, failed, unsupported and persisted enabled states', () => {
        expect(rearSettingsState(null, false)).toBe('detecting');
        expect(rearSettingsHint(null)).toBeNull();
        expect(rearSettingsState(null, true)).toBe('failed');
        expect(rearSettingsState({ enabled: false, rearDisplayId: -1 }, false)).toBe('unsupported');
        expect(rearSettingsCanToggle({ enabled: false, rearDisplayId: -1 }, false)).toBe(false);
        expect(rearSettingsCanToggle({ enabled: true, rearDisplayId: -1 }, false)).toBe(true);
        expect(rearSettingsState({ enabled: true, active: false, sleeping: true }, false)).toBe('enabled');
    });
    it('does not show a Shizuku warning or enable a switch before detection finishes', async () => {
        bridge.getRearLyricsStatus.mockReturnValue(new Promise(() => {}));
        await act(async () => root.render(rear()));
        expect(host.textContent).toContain('等待检测'); expect(host.textContent).not.toContain('请先启动 Shizuku');
        expect(rearToggle().disabled).toBe(true);
    });
    it('reads real display ID/build and toggles the existing persisted native preference', async () => {
        await act(async () => root.render(rear()));
        expect(host.textContent).toContain('r250 · 已检测到背屏 ID 1');
        expect(rearToggle().textContent).toContain('开启背屏歌词');
        await act(async () => rearToggle().click());
        expect(bridge.startRearLyrics).toHaveBeenCalledTimes(1);
        expect(rearToggle().getAttribute('aria-checked')).toBe('true');
        expect(host.textContent).toContain('已开启');
        await act(async () => rearToggle().click());
        expect(bridge.returnFromRearLyrics).toHaveBeenCalledTimes(1);
        expect(rearToggle().getAttribute('aria-checked')).toBe('false');
        expect(host.querySelector('input[type="checkbox"]')).toBeNull();
        expect(bridge.setRearCoverSleep).not.toHaveBeenCalled();
    });
    it('disables unsupported hardware while allowing an enabled preference to be turned off', async () => {
        status.rearDisplayId = -1;
        await act(async () => root.render(rear()));
        expect(rearToggle().disabled).toBe(true); expect(host.textContent).toContain('当前未检测到支持的背屏');
        status.enabled = true;
        await act(async () => vi.advanceTimersByTime(3000));
        expect(rearToggle().disabled).toBe(false);
        await act(async () => rearToggle().click());
        expect(bridge.returnFromRearLyrics).toHaveBeenCalledTimes(1);
    });
    it('retains enabled state after failed verification, logs details without showing raw errors', async () => {
        const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
        bridge.startRearLyrics.mockImplementation(async () => { status.enabled = true; throw new Error('internal shell / binder failure'); });
        await act(async () => root.render(rear()));
        await act(async () => rearToggle().click());
        expect(rearToggle().textContent).toContain('关闭背屏歌词');
        expect(host.textContent).toContain('已开启'); expect(host.textContent).not.toContain('internal shell');
        expect(host.textContent).toContain('操作未完成'); logging.mockRestore();
    });
    it('allows a real detection retry after failure', async () => {
        const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
        bridge.getRearLyricsStatus.mockRejectedValueOnce(new Error('device unreachable'));
        await act(async () => root.render(rear()));
        expect(host.textContent).toContain('检测失败'); expect(rearToggle().disabled).toBe(true);
        await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent === '重新检测')!.click());
        expect(host.textContent).toContain('已检测到背屏 ID 1'); expect(rearToggle().disabled).toBe(false); logging.mockRestore();
    });
    it('pauses polling while hidden and releases timers on exit', async () => {
        await act(async () => root.render(rear()));
        expect(bridge.getRearLyricsStatus).toHaveBeenCalledTimes(1);
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        await act(async () => vi.advanceTimersByTime(6000));
        expect(bridge.getRearLyricsStatus).toHaveBeenCalledTimes(1);
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        await act(async () => document.dispatchEvent(new Event('visibilitychange')));
        expect(bridge.getRearLyricsStatus).toHaveBeenCalledTimes(2);
        act(() => root.render(null));
        await act(async () => vi.advanceTimersByTime(6000));
        expect(bridge.getRearLyricsStatus).toHaveBeenCalledTimes(2);
    });
    it('discards a pre-action status response instead of overwriting the enabled preference', async () => {
        await act(async () => root.render(rear()));
        let stale!: (value: RearLyricsStatus) => void;
        bridge.getRearLyricsStatus.mockImplementationOnce(() => new Promise(resolve => { stale = resolve; }));
        await act(async () => vi.advanceTimersByTime(3000));
        await act(async () => rearToggle().click());
        expect(rearToggle().getAttribute('aria-checked')).toBe('true');
        await act(async () => stale({ ...status, enabled: false }));
        expect(rearToggle().getAttribute('aria-checked')).toBe('true');
    });
});

describe('mobile options navigation and existing controls', () => {
    it('shows only the primary title and close action, then section back/help actions', () => {
        const onClose = vi.fn(), onBack = vi.fn(), onHelp = vi.fn();
        act(() => root.render(h(MobileSettingsHeader, { primary: true, title: '选项', onClose, onBack, onHelp })));
        expect(host.querySelectorAll('button')).toHaveLength(1); expect(host.querySelector('h1')?.textContent).toBe('选项');
        act(() => host.querySelector('button')!.click()); expect(onClose).toHaveBeenCalledOnce();
        act(() => root.render(h(MobileSettingsHeader, { primary: false, title: '视觉设置', onClose, onBack, onHelp })));
        act(() => host.querySelector<HTMLButtonElement>('[aria-label="返回"]')!.click()); expect(onBack).toHaveBeenCalledOnce();
        act(() => host.querySelector<HTMLButtonElement>('[aria-label="使用说明"]')!.click()); expect(onHelp).toHaveBeenCalledOnce();
        expect(host.textContent).not.toContain('全部设置');
    });
    it('keeps every existing mobile section, opens guide/help, restores the home scroll offset', async () => {
        const onSelect = vi.fn(), onGuide = vi.fn(), onHelp = vi.fn();
        const groups = buildSettingsNavGroups(translate, { isElectron: false });
        const render = (index: boolean) => root.render(h(MobileSettingsNavigation, { groups, index, onSelect, onGuide, onHelp }));
        await act(async () => render(true));
        const rows = host.querySelectorAll('.ty-settings-navigation .ty-settings-row');
        expect(rows.length).toBe(groups.flatMap(group => group.items).length + 1);
        const scroller = host.querySelector<HTMLElement>('.ty-settings-home')!; scroller.scrollTop = 460;
        act(() => rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
        expect(onSelect).toHaveBeenCalledWith('appearance');
        act(() => host.querySelector<HTMLButtonElement>('.ty-rear-guide-link')!.click()); expect(onGuide).toHaveBeenCalledOnce();
        act(() => (rows[rows.length - 1] as HTMLButtonElement).click()); expect(onHelp).toHaveBeenCalledOnce();
        act(() => render(false)); expect(host.textContent).toBe('');
        await act(async () => render(true)); expect(host.querySelector<HTMLElement>('.ty-settings-home')!.scrollTop).toBe(460);
    });
    it('updates the original immersive store and storage key, preserving display settings access', async () => {
        const onOpenDisplaySettings = vi.fn();
        await act(async () => root.render(h(AndroidImmersiveSetting, { isDaylight: false, settingsCardClass: '', compact: true, onOpenDisplaySettings })));
        const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]')!;
        act(() => toggle.click());
        expect(useAndroidLayoutSettingsStore.getState().immersiveModeEnabled).toBe(true);
        expect(storage.get('folia_android_immersive_mode')).toBe('true');
        expect(toggle.getAttribute('aria-checked')).toBe('true');
        act(() => host.querySelector<HTMLButtonElement>('.ty-immersive-link')!.click()); expect(onOpenDisplaySettings).toHaveBeenCalledOnce();
        act(() => toggle.click()); expect(storage.get('folia_android_immersive_mode')).toBe('false');
    });
    it('keeps the existing daylight control in the compact secondary view', () => {
        const onSetDaylightPreference = vi.fn();
        act(() => root.render(h(SettingsSectionHeader, { compact: true, title: '视觉设置', description: '设置', showDaylightToggle: true, isDaylight: false, onSetDaylightPreference, daylightLabel: '日间模式', utilityGhostButtonClass: '' })));
        expect(host.querySelector('h2')).toBeNull();
        act(() => host.querySelector('button')!.click()); expect(onSetDaylightPreference).toHaveBeenCalledWith(true);
    });
});

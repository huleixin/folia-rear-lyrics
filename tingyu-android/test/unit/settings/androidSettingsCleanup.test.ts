// @vitest-environment jsdom
import React, { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GeneralSettingsSubview from '@/components/modal/settings/GeneralSettingsSubview';
import DeveloperSettingsSubview from '@/components/modal/settings/DeveloperSettingsSubview';
import MobileStageMenu from '@/components/app/overlays/mobile-stage/MobileStageMenu';
import { buildSettingsNavGroups } from '@/components/modal/settings/navigation/settingsNavModel';
import { createSettingsAnchorCommand } from '@/components/command-palette/commandFactories';
import type { CommandPaletteContext } from '@/components/command-palette/types';
import { useAppViewStore } from '@/stores/useAppViewStore';
import { useHomeLayoutSettingsStore } from '@/stores/useHomeLayoutSettingsStore';

// test/unit/settings/androidSettingsCleanup.test.ts
const debug = vi.hoisted(() => ({ available: false, runtimeLogEnabled: false, runtimeLogMode: 'append', runtimeFile: null,
    memoryMonitorEnabled: false, memoryLogEnabled: false, memoryLogMode: 'overwrite', memoryFile: null, memoryIntervalMs: 2000 }));
vi.mock('react-i18next', async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(), useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'zh-CN' } }) }));
vi.mock('@/components/modal/settings/PinnedCommandSettings', () => ({ default: () => h('span', null, 'pinned-marker') }));
vi.mock('@/components/modal/settings/AdaptiveLayoutSetting', () => ({ default: () => h('span', null, 'adaptive-marker') }));
vi.mock('@/components/modal/settings/AndroidRearLyricsSetting', () => ({ default: () => h('span', null, 'rear-marker') }));
vi.mock('@/components/modal/settings/AndroidImmersiveSetting', () => ({ default: () => h('span', null, 'immersive-marker') }));
vi.mock('@/components/modal/settings/CommandPaletteButtonSetting', () => ({ default: () => h('span', null, 'command-marker') }));
vi.mock('@/components/modal/settings/HomeCardPositionSection', () => ({ default: () => h('span', null, 'position-marker') }));
vi.mock('@/components/modal/settings/PlaybackEntryViewSection', () => ({ default: () => null }));
vi.mock('@/components/modal/settings/LibrarySuiteSection', () => ({ default: () => null }));
vi.mock('@/components/modal/settings/BravaisSettingsSection', () => ({ default: () => null }));
vi.mock('@/components/modal/settings/PlayerBottomBarSection', () => ({ default: () => h('span', null, 'controls-marker') }));
vi.mock('@/components/modal/settings/AndroidKeepScreenOnSetting', () => ({ default: () => h('span', null, 'awake-marker') }));
vi.mock('@/components/modal/settings/AndroidPhoneFitSetting', () => ({ default: () => h('span', null, 'phone-marker') }));
vi.mock('@/components/shared/ConsoleLogPanel', () => ({ default: () => h('span', null, 'session-log-marker') }));
vi.mock('@/services/debug/debugModule', () => ({ getDebugModuleSnapshot: () => debug, subscribeToDebugModule: () => () => {},
    openDebugLogsFolder: vi.fn(), setDebugModuleState: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
const native = (platform: string) => Object.defineProperty(window, 'Capacitor', { configurable: true, value: { getPlatform: () => platform } });
beforeEach(() => { native('android'); debug.available = false; host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); delete (window as unknown as Record<string, unknown>).Capacitor; });
const props = { isDaylight: false, settingsCardClass: '', utilityGhostButtonClass: '', toggleOffBackgroundClass: '' };
describe('Android settings cleanup boundaries', () => {
    it('hides duplicate and unsupported general rows without changing retained preferences or working settings', () => {
        const remembered = useHomeLayoutSettingsStore.getState().rememberHomeCardPosition;
        act(() => root.render(h(GeneralSettingsSubview, props)));
        for (const marker of ['pinned','adaptive','rear','immersive','command','position']) expect(host.textContent).not.toContain(marker+'-marker');
        for (const marker of ['awake','phone']) expect(host.textContent).toContain(marker+'-marker');
        expect(host.textContent).toContain('options.showHomeTabPlaylist');
        expect(host.textContent).not.toContain('controls-marker');
        expect(useHomeLayoutSettingsStore.getState().rememberHomeCardPosition).toBe(remembered);
    });
    it('retains the prior general entries for non-Android builds', () => {
        native('web'); act(() => root.render(h(GeneralSettingsSubview, props)));
        for (const marker of ['pinned','adaptive','rear','immersive','command','position']) expect(host.textContent).toContain(marker+'-marker');
    });
    it('does not advertise hidden settings anchors in Android navigation', () => {
        const ids = (android: boolean) => buildSettingsNavGroups(k => k, { isElectron: false, isAndroid: android }).flatMap(g => g.items.flatMap(i => i.anchors.map(a => a.id)));
        for (const id of ['grid3dCardStyle','rememberHomeCardPosition','pinnedCommands','gridActionButton','gridPaletteHotkey']) {
            expect(ids(true)).not.toContain(id); expect(ids(false)).toContain(id);
        }
        expect(ids(true)).toContain('homeTabsVisibility'); expect(ids(true)).not.toContain('customShortcut');
    });
    it('blocks hidden settings commands as well as their navigation anchors', () => {
        const open = vi.fn();
        const ctx = { settings: { openSettings: open } } as unknown as CommandPaletteContext;
        const command = createSettingsAnchorCommand('test-hidden-anchor', 'Hidden', '', [], 'pinnedCommands');
        expect(command.isAvailable?.(ctx)).toBe(false); expect(command.execute('', ctx)).toBe(false);
        expect(open).not.toHaveBeenCalled();
        native('web'); expect(command.isAvailable?.(ctx)).toBe(true); expect(command.execute('', ctx)).toBe(true);
        expect(open).toHaveBeenCalledOnce();
    });
    it('keeps session logs while hiding unavailable desktop file logging and memory monitoring', () => {
        act(() => root.render(h(DeveloperSettingsSubview, props)));
        expect(host.textContent).toContain('session-log-marker');
        expect(host.textContent).not.toContain('options.debugLogsToFile');
        expect(host.textContent).not.toContain('options.memoryMonitor');
        debug.available = true; act(() => root.render(h(DeveloperSettingsSubview, props)));
        expect(host.textContent).toContain('options.debugLogsToFile'); expect(host.textContent).toContain('options.memoryMonitor');
    });
    it('removes the stage command entry and preserves real lyrics/audio actions', async () => {
        const close = vi.fn(); act(() => root.render(h(MobileStageMenu, { onClose: close })));
        // Four original destinations plus the queue, which the minimal player page has no room for
        // in its own transport row.
        expect(host.querySelectorAll('[role="menuitem"]')).toHaveLength(5);
        expect(host.textContent).not.toContain('mobileStage.commands');
        // 第 11 轮：歌词入口先问原生工具页（openNativeToolPage 异步），无原生环境时回退面板。
        act(() => host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[2].click());
        await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
        expect(useAppViewStore.getState().panelTab).toBe('onlineLyrics');
        expect(useAppViewStore.getState().isPanelOpen).toBe(true); expect(close).toHaveBeenCalledOnce();
    });
    it('offers the queue from the stage menu for the minimal player page', async () => {
        const close = vi.fn();
        useAppViewStore.getState().setIsPanelOpen(false);
        act(() => root.render(h(MobileStageMenu, { onClose: close })));
        act(() => host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[3].click());
        // 入口先问原生队列（openNativeQueueSheet 是异步的），没有原生环境才落回面板。
        // 微任务清空后断言回退路径：面板开在 queue 页。
        await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
        expect(useAppViewStore.getState().panelTab).toBe('queue');
        expect(useAppViewStore.getState().isPanelOpen).toBe(true);
        expect(close).toHaveBeenCalledOnce();
    });
});

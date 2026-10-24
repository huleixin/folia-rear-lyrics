// @vitest-environment jsdom
import React, { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MobilePlaybackStartupSetting from '@/components/modal/settings/MobilePlaybackStartupSetting';
import MobilePlayerDisplaySetting from '@/components/modal/settings/MobilePlayerDisplaySetting';
import MotionReductionSettingsSection from '@/components/modal/settings/MotionReductionSettingsSection';
import { isSettingsAnchorAvailable, isSettingsSubviewAvailable } from '@/components/modal/settings/navigation/settingsAnchorModel';
import { resolveInitialSettingsSection, SETTINGS_LAST_SECTION_STORAGE_KEY } from '@/components/modal/settings/navigation/settingsLastSection';
import { createSettingsCommand, createSettingsAnchorCommand } from '@/components/command-palette/commandFactories';
import type { CommandPaletteContext } from '@/components/command-palette/types';
import { useAudioSettingsStore } from '@/stores/useAudioSettingsStore';
import { useTypographySettingsStore } from '@/stores/useTypographySettingsStore';
import { useMotionSettingsStore, MOTION_SURFACE_IDS } from '@/stores/useMotionSettingsStore';

// test/unit/settings/mobileSettingsCapabilities.test.ts
// Exercise real preference owners and stale navigation, rather than assuming hidden controls have no consumers.
vi.mock('react-i18next', async importOriginal => ({
    ...await importOriginal<typeof import('react-i18next')>(),
    useTranslation: () => ({ t: (key: string) => key }),
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
const props = { isDaylight: false, settingsCardClass: '' };
const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
beforeEach(() => {
    vi.stubGlobal('Capacitor', { getPlatform: () => 'android' });
    localStorage.clear();
    useAudioSettingsStore.setState({ autoPlayOnLaunch: false });
    useTypographySettingsStore.setState({ hidePlayerTranslationSubtitle: false });
    useMotionSettingsStore.setState({
        reducedMotionSurfaces: Object.fromEntries(MOTION_SURFACE_IDS.map(id => [id, false])) as Record<typeof MOTION_SURFACE_IDS[number], boolean>,
        followSystemReducedMotion: false, systemPrefersReducedMotion: false,
    });
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe('Android settings retain working preferences and reject retired destinations', () => {
    it('moves autoplay without changing its existing persisted owner or starting playback on render', () => {
        act(() => root.render(h(MobilePlaybackStartupSetting, props)));
        expect(useAudioSettingsStore.getState().autoPlayOnLaunch).toBe(false);
        act(() => button('options.autoPlayOnLaunch').click());
        expect(useAudioSettingsStore.getState().autoPlayOnLaunch).toBe(true);
        expect(button('options.autoPlayOnLaunch').getAttribute('aria-pressed')).toBe('true');
        expect(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).some(key => key?.includes('auto_play'))).toBe(true);
        act(() => button('options.autoPlayOnLaunch').click());
        expect(useAudioSettingsStore.getState().autoPlayOnLaunch).toBe(false);
    });
    it('preserves saved front-stage subtitle preference and writes the same storage key', () => {
        useTypographySettingsStore.setState({ hidePlayerTranslationSubtitle: true });
        act(() => root.render(h(MobilePlayerDisplaySetting, props)));
        expect(button('options.hidePlayerTranslationSubtitle').getAttribute('aria-pressed')).toBe('true');
        act(() => button('options.hidePlayerTranslationSubtitle').click());
        expect(useTypographySettingsStore.getState().hidePlayerTranslationSubtitle).toBe(false);
        expect(localStorage.getItem('hide_player_translation_subtitle')).toBe('false');
    });
    it('does not duplicate relocated controls on the web', () => {
        vi.stubGlobal('Capacitor', { getPlatform: () => 'web' });
        act(() => root.render(h(React.Fragment, null, h(MobilePlayerDisplaySetting, props), h(MobilePlaybackStartupSetting, props))));
        expect(host.childElementCount).toBe(0);
    });
    it('filters retired anchors and sections only on Android', () => {
        for (const id of ['latticeSettings', 'gridViewCardSettings', 'stageTrackPill', 'bottomUiSettings', 'customShortcut', 'labPlayerUi', 'labWindowAndTools'] as const) {
            expect(isSettingsAnchorAvailable(id, true)).toBe(false);
            expect(isSettingsAnchorAvailable(id, false)).toBe(true);
        }
        for (const id of ['mobilePlayerDisplay', 'playbackStartup', 'mobileAiProvider'] as const) {
            expect(isSettingsAnchorAvailable(id, true)).toBe(true);
            expect(isSettingsAnchorAvailable(id, false)).toBe(false);
        }
        expect(isSettingsSubviewAvailable('interaction', true)).toBe(false);
        expect(isSettingsSubviewAvailable('lab', false)).toBe(true);
    });
    it('falls back safely for remembered and explicit removed pages', () => {
        for (const initialSubview of ['lab', 'interaction'] as const) {
            localStorage.setItem(SETTINGS_LAST_SECTION_STORAGE_KEY, initialSubview);
            const request = { isElectron: false, isAndroid: true, hasInitialAnchor: false };
            expect(resolveInitialSettingsSection({ ...request, initialSubview: null })).toBe('appearance');
            expect(resolveInitialSettingsSection({ ...request, initialSubview })).toBe('appearance');
            expect(resolveInitialSettingsSection({ ...request, isAndroid: false, initialSubview })).toBe(initialSubview);
        }
    });
    it('prevents obsolete command destinations from opening a blank panel', () => {
        const openSettings = vi.fn();
        const context = { settings: { openSettings } } as unknown as CommandPaletteContext;
        const commands = [createSettingsCommand('lab', '', '', [], 'options', 'lab'), createSettingsAnchorCommand('lattice', '', '', [], 'latticeSettings')];
        for (const command of commands) {
            expect(command.isAvailable?.(context)).toBe(false);
            expect(command.execute('', context)).toBe(false);
        }
        expect(openSettings).not.toHaveBeenCalled();
        vi.stubGlobal('Capacitor', { getPlatform: () => 'web' });
        for (const command of commands) expect(command.execute('', context)).toBe(true);
        expect(openSettings).toHaveBeenCalledTimes(2);
    });
    it('shows effective system-reduced motion without overwriting personal preferences', () => {
        useMotionSettingsStore.setState({ followSystemReducedMotion: true, systemPrefersReducedMotion: true });
        act(() => root.render(h(MotionReductionSettingsSection, { ...props, settingsDividerClass: '', toggleOffBackgroundClass: '' })));
        expect(host.querySelectorAll('button')).toHaveLength(4);
        const micro = button('options.reduceMotionUiMicroMotion');
        expect(micro.disabled).toBe(true); expect(micro.getAttribute('aria-pressed')).toBe('true');
        expect(useMotionSettingsStore.getState().reducedMotionSurfaces.uiMicroMotion).toBe(false);
        act(() => button('options.reduceMotionFollowSystem').click());
        expect(micro.disabled).toBe(false); expect(micro.getAttribute('aria-pressed')).toBe('false');
        act(() => micro.click());
        expect(useMotionSettingsStore.getState().reducedMotionSurfaces.uiMicroMotion).toBe(true);
        expect(localStorage.getItem('reduce_motion_uiMicroMotion')).toBe('true');
        expect(useMotionSettingsStore.getState().reducedMotionSurfaces.lattice).toBe(false);
    });
});

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { isTabletSettingsDualPane, resolveSettingsOverlayBacking } from '../../src/utils/nativeShellState';
import { dispatchSettingsSplitAction, handleSettingsPaneBack } from '../../src/components/modal/settings/settingsSplitNavigation';
import { hasRearDisplayCapability, shouldShowRearLyricsEntry } from '../../src/components/modal/settings/rearControlModel';
import { useSettingsModalStore } from '../../src/stores/useSettingsModalStore';

describe('Tablet second-round split settings & shell state', () => {
    beforeEach(() => {
        useSettingsModalStore.setState({
            isSubSettingsViewOpen: false,
            settingsModalState: {
                isOpen: false,
                initialTab: 'help',
                initialSubview: null,
                initialVisualizerSection: null,
                initialAnchor: null,
                subviewBackStack: [],
            },
        });
    });

    it('treats landscape and wide portrait tablets as settingsDualPane', () => {
        vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 800 });
        expect(isTabletSettingsDualPane()).toBe(true);
        vi.stubGlobal('window', { innerWidth: 800, innerHeight: 1280 });
        expect(isTabletSettingsDualPane()).toBe(true);
        vi.stubGlobal('window', { innerWidth: 393, innerHeight: 852 });
        expect(isTabletSettingsDualPane()).toBe(false);
        vi.unstubAllGlobals();
    });

    it('projects accounts to settings:document:accounts when dualPane is true', () => {
        const store = useSettingsModalStore.getState();
        store.openSettingsFromIndex('accounts');
        const state = useSettingsModalStore.getState().settingsModalState;

        expect(resolveSettingsOverlayBacking(state, false)).toEqual({
            settingsOwnsRoute: true,
            settingsIndex: true,
            pageTarget: 'settings:index',
        });

        expect(resolveSettingsOverlayBacking(state, true)).toEqual({
            settingsOwnsRoute: true,
            settingsIndex: false,
            pageTarget: 'settings:document:accounts',
        });
    });

    it('dispatches middle-column split actions straight to the target subview', () => {
        expect(dispatchSettingsSplitAction('settings:accounts')).toBe(true);
        expect(useSettingsModalStore.getState().settingsModalState.initialSubview).toBe('accounts');

        expect(dispatchSettingsSplitAction('settings:appearance')).toBe(true);
        expect(useSettingsModalStore.getState().settingsModalState.initialSubview).toBe('appearance');

        expect(dispatchSettingsSplitAction('discovery:settings')).toBe(true);
        expect(useSettingsModalStore.getState().settingsModalState.initialSubview).toBe('discovery');

        expect(dispatchSettingsSplitAction('rear:open')).toBe(true);
        expect(useSettingsModalStore.getState().settingsModalState.rearPage).toBe('control');
    });

    it('pops nested right-pane stack first on tablet Back and closes Settings at top-level', () => {
        vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 800 });
        const store = useSettingsModalStore.getState();
        store.openSettingsFromIndex('discovery');
        store.pushSettingsSubview('accounts');
        const closeSpy = vi.fn();

        // First Back pops nested subview inside right pane back to discovery
        handleSettingsPaneBack(true, closeSpy);
        expect(closeSpy).not.toHaveBeenCalled();
        expect(useSettingsModalStore.getState().settingsModalState.initialSubview).toBe('discovery');

        // Second Back at top-level right pane exits Settings instead of landing on empty index
        handleSettingsPaneBack(true, closeSpy);
        expect(closeSpy).toHaveBeenCalledOnce();
        vi.unstubAllGlobals();
    });

    it('routes all regular tablet setting actions to their exact detail page targets', () => {
        const expectedTargets: Array<[string, string]> = [
            ['settings:accounts', 'settings:document:accounts'],
            ['discovery:settings', 'settings:document:discovery'],
            ['search:settings', 'settings:document:search'],
            ['settings:appearance', 'settings:document:options:appearance:'],
            ['settings:general', 'settings:document:options:general:'],
            ['settings:playback', 'settings:document:options:playback:'],
            ['settings:integration', 'settings:document:options:integration:'],
            ['settings:storage', 'settings:document:options:storage:'],
            ['settings:graphics', 'settings:document:options:graphics:'],
            ['help', 'settings:document:help:'],
            ['rear:open', 'settings:rear:control'],
        ];
        for (const [action, target] of expectedTargets) {
            expect(dispatchSettingsSplitAction(action)).toBe(true);
            const state = useSettingsModalStore.getState().settingsModalState;
            const backing = resolveSettingsOverlayBacking(state, true);
            expect(backing.settingsOwnsRoute).toBe(true);
            if (target.endsWith(':')) {
                expect(backing.pageTarget.startsWith(target)).toBe(true);
            } else {
                expect(backing.pageTarget).toBe(target);
            }
        }
    });

    it('hides rear lyrics entry on unsupported tablets while preserving it on rear-capable devices (even without Shizuku auth) and phones', () => {
        // Ordinary tablet with no rear display
        const unsupportedTabletStatus = {
            backendMode: 'shizuku' as const,
            shizukuAvailable: false,
            authorized: false,
            rearDisplayId: -1,
            rearHardwareSupported: false,
        };
        expect(hasRearDisplayCapability(unsupportedTabletStatus)).toBe(false);
        expect(shouldShowRearLyricsEntry(unsupportedTabletStatus, true)).toBe(false);
        expect(shouldShowRearLyricsEntry(null, true)).toBe(false);

        // Rear-capable device where Shizuku permission has NOT been granted yet
        const unauthedRearCapableStatus = {
            backendMode: 'shizuku' as const,
            shizukuAvailable: false,
            authorized: false,
            rearDisplayId: 2,
            rearHardwareSupported: true,
        };
        expect(hasRearDisplayCapability(unauthedRearCapableStatus)).toBe(true);
        expect(shouldShowRearLyricsEntry(unauthedRearCapableStatus, true)).toBe(true);

        // Phone retains rear lyrics entry regardless of initial snapshot
        expect(shouldShowRearLyricsEntry(null, false)).toBe(true);
        expect(shouldShowRearLyricsEntry({ rearDisplayId: -1 }, false)).toBe(true);
    });
});

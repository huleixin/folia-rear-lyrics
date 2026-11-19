import { describe, expect, it, beforeEach, vi } from 'vitest';
import { isTabletSettingsDualPane, resolveSettingsOverlayBacking } from '../../src/utils/nativeShellState';
import { dispatchSettingsSplitAction, handleSettingsPaneBack } from '../../src/components/modal/settings/settingsSplitNavigation';
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
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { registerModalBack, runTopModalBack } from '../../../src/services/modalBackStack';
import { useSettingsModalStore } from '../../../src/stores/useSettingsModalStore';

describe('1.5.74 PlatformAccountsPage unified back stack', () => {
    beforeEach(() => {
        useSettingsModalStore.getState().closeSettings();
    });

    it('pops child sheet first and then returns to Settings index without double-popping', () => {
        const store = useSettingsModalStore.getState();
        store.openSettingsFromIndex('accounts');
        expect(useSettingsModalStore.getState().settingsModalState.initialSubview).toBe('accounts');

        let sheetClosed = false;
        let accountPageClosing = false;
        const commitReturn = vi.fn(() => {
            useSettingsModalStore.getState().returnSettingsToIndex();
        });

        const unregPage = registerModalBack(() => {
            if (accountPageClosing) return;
            accountPageClosing = true;
            commitReturn();
        });
        const unregSheet = registerModalBack(() => {
            sheetClosed = true;
            unregSheet();
        });

        // 1st back: closes child sheet only
        expect(runTopModalBack()).toBe(true);
        expect(sheetClosed).toBe(true);
        expect(accountPageClosing).toBe(false);
        expect(useSettingsModalStore.getState().settingsModalState.initialSubview).toBe('accounts');

        // 2nd back: closes accounts page and returns to Settings index
        expect(runTopModalBack()).toBe(true);
        expect(accountPageClosing).toBe(true);
        expect(commitReturn).toHaveBeenCalledTimes(1);
        expect(useSettingsModalStore.getState().settingsModalState.isOpen).toBe(true);
        expect(useSettingsModalStore.getState().settingsModalState.initialSubview).toBeNull();

        // Rapid 3rd back while closing: guarded, does not double-commit
        expect(runTopModalBack()).toBe(true);
        expect(commitReturn).toHaveBeenCalledTimes(1);

        unregPage();
    });
});

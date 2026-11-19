import { useEffect, useState } from 'react';
import { useSettingsModalStore, type SettingsSubviewId } from '../../../stores/useSettingsModalStore';
import { isTabletSettingsDualPane } from '../../../utils/nativeShellState';
import { writeLastSettingsSection } from './navigation/settingsLastSection';
import type { SettingsSectionId } from './navigation/settingsNavModel';

// src/components/modal/settings/settingsSplitNavigation.ts
// Shared tablet dual-pane action dispatch & back handling across Settings surfaces.
export function dispatchSettingsSplitAction(action: string): boolean {
    const store = useSettingsModalStore.getState();
    if (action === 'settings:accounts') {
        store.openSettingsFromIndex('accounts');
        return true;
    }
    if (action === 'discovery:settings') {
        store.openSettingsFromIndex('discovery');
        return true;
    }
    if (action === 'search:settings') {
        store.openSettingsFromIndex('search');
        return true;
    }
    if (action === 'rear:open') {
        store.openRearSettings('control');
        return true;
    }
    if (action === 'help') {
        store.openSettingsFromIndex('help');
        return true;
    }
    if (action.startsWith('settings:')) {
        const sectionId = action.slice('settings:'.length);
        if (!sectionId) return false;
        writeLastSettingsSection(sectionId as SettingsSectionId, { isElectron: false });
        store.openSettingsFromIndex(sectionId as SettingsSubviewId);
        return true;
    }
    return false;
}

/**
 * In tablet dual-pane mode, pressing Back at a top-level setting exits Settings directly instead of
 * dropping onto an empty master-detail index. Deeper stacked subviews pop inside the right pane first.
 */
export function handleSettingsPaneBack(fromIndex: boolean | undefined, onClose: () => void): void {
    const stackLen = useSettingsModalStore.getState().settingsModalState.subviewBackStack?.length ?? 0;
    if (fromIndex && (!isTabletSettingsDualPane() || stackLen > 0)) {
        useSettingsModalStore.getState().returnSettingsToIndex();
        return;
    }
    onClose();
}

export function useTabletSettingsDualPane(): boolean {
    const [dual, setDual] = useState(() => isTabletSettingsDualPane());
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const sync = () => setDual(isTabletSettingsDualPane());
        sync();
        window.addEventListener('resize', sync);
        window.visualViewport?.addEventListener('resize', sync);
        return () => {
            window.removeEventListener('resize', sync);
            window.visualViewport?.removeEventListener('resize', sync);
        };
    }, []);
    return dual;
}

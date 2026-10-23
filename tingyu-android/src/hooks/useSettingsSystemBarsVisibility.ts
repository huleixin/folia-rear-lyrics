import { useCallback, useEffect, useRef } from 'react';
import { setAndroidMainSystemBarsVisible } from '../services/androidMainSystemBars';

// src/hooks/useSettingsSystemBarsVisibility.ts
/** Settings keep system controls legible without taking over the player's existing reveal timer. */
export function useSettingsSystemBarsVisibility(settingsOpen: boolean) {
    const open = useRef(settingsOpen);
    const playerRequest = useRef(true);
    open.current = settingsOpen;
    useEffect(() => {
        setAndroidMainSystemBarsVisible(settingsOpen || playerRequest.current);
    }, [settingsOpen]);
    return useCallback((visible: boolean) => {
        playerRequest.current = visible;
        setAndroidMainSystemBarsVisible(open.current || visible);
    }, []);
}

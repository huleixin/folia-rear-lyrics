import { useCallback, useEffect, useRef, useState } from 'react';
import { canUseRearLyrics, rearLyricsPlugin, type RearLyricsStatus } from '../../../services/rearLyricsControl';
import { rearSettingsCanToggle, rearSettingsFingerprint } from './rearLyricsSettingsModel';

// src/components/modal/settings/useRearLyricsSettings.ts
export function useRearLyricsSettings(poll = true) {
    const [available] = useState(canUseRearLyrics);
    const [snapshot, setSnapshot] = useState<RearLyricsStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const [actionFailed, setActionFailed] = useState(false);
    const mounted = useRef(false);
    const revision = useRef(0);
    const locked = useRef(false);
    const polling = useRef(false);
    const current = useRef(snapshot);
    const commit = useCallback((result: RearLyricsStatus) => {
        current.current = result;
        setSnapshot(previous => previous && rearSettingsFingerprint(previous) === rearSettingsFingerprint(result) ? previous : result);
        setFailed(false);
    }, []);
    const refresh = useCallback(async () => {
        if (polling.current || locked.current || document.hidden) return;
        const plugin = rearLyricsPlugin();
        if (!plugin) return;
        polling.current = true;
        const requestedAt = revision.current;
        try {
            const result = await plugin.getRearLyricsStatus();
            if (mounted.current && requestedAt === revision.current) commit(result);
        } catch (error) {
            console.error('[settings/rear-lyrics] status unavailable', error);
            if (mounted.current && requestedAt === revision.current) setFailed(true);
        } finally { polling.current = false; }
    }, [commit]);
    useEffect(() => {
        mounted.current = true;
        if (!available) return () => { mounted.current = false; };
        void refresh();
        const timer = poll ? window.setInterval(() => void refresh(), 3000) : undefined;
        const onVisibility = () => { if (!document.hidden) void refresh(); };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            mounted.current = false;
            revision.current++;
            if (timer !== undefined) window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [available, poll, refresh]);
    const toggle = useCallback(async () => {
        const plugin = rearLyricsPlugin();
        if (!plugin || locked.current || !rearSettingsCanToggle(current.current, false)) return;
        locked.current = true;
        revision.current++; // Invalidate a status read that started before the user's action.
        setBusy(true); setActionFailed(false);
        try {
            if (current.current?.enabled) await plugin.returnFromRearLyrics();
            else if (!(await plugin.startRearLyrics())?.verified) throw new Error('Rear display did not confirm startup');
        } catch (error) {
            console.error('[settings/rear-lyrics] action failed', error);
            if (mounted.current) setActionFailed(true);
        } finally {
            // Read the persisted preference even after a launch failure; never pretend it switched off.
            try {
                const result = await plugin.getRearLyricsStatus();
                if (mounted.current) commit(result);
            } catch (error) {
                console.error('[settings/rear-lyrics] refresh after action failed', error);
                if (mounted.current) setFailed(true);
            }
            locked.current = false;
            if (mounted.current) setBusy(false);
        }
    }, [commit]);
    return { available, snapshot, busy, failed, actionFailed, refresh, toggle };
}

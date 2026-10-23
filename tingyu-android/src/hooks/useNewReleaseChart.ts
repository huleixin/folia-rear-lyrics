import { useCallback, useEffect, useState } from 'react';
import type { ProviderCollection } from '../types/onlineMusic';
import { loadNewReleaseChart, NEW_RELEASE_FRESH_MS } from '../services/onlineMusic/newReleaseCharts';

// src/hooks/useNewReleaseChart.ts
type Snapshot = { owner: string; status: 'loading' | 'ready' | 'error'; collection?: ProviderCollection };
export function useNewReleaseChart(providerId: string) {
    const [attempt, setAttempt] = useState(0);
    const [snapshot, setSnapshot] = useState<Snapshot>({ owner: '', status: 'loading' });
    const supported = providerId === 'qq' || providerId === 'netease';
    useEffect(() => {
        if (!supported) return;
        let disposed = false;
        let timer: ReturnType<typeof setTimeout>;
        const load = async () => {
            try {
                const collection = await loadNewReleaseChart(providerId);
                if (disposed) return;
                setSnapshot({ owner: providerId, status: 'ready', collection });
                clearTimeout(timer);
                timer = setTimeout(() => { if (!document.hidden) void load(); }, NEW_RELEASE_FRESH_MS + 1);
            } catch {
                if (!disposed) setSnapshot({ owner: providerId, status: 'error' });
            }
        };
        const onVisible = () => { if (!document.hidden) void load(); };
        setSnapshot({ owner: providerId, status: 'loading' });
        void load();
        document.addEventListener('visibilitychange', onVisible);
        return () => { disposed = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
    }, [providerId, supported, attempt]);
    const retry = useCallback(() => setAttempt(value => value + 1), []);
    const current: Snapshot = snapshot.owner === providerId ? snapshot : { owner: providerId, status: 'loading' };
    return { ...current, supported, retry };
}

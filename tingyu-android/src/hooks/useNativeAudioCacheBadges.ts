import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isCapacitorAndroid } from '../platform/runtime';
import { getTingyuPlayback } from '../platform/tingyuPlayback';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { useLxSourceStore } from '../stores/useLxSourceStore';
import type { NativePageModel } from '../types/nativePages';

// src/hooks/useNativeAudioCacheBadges.ts
// Batch-check only the presented songs, never full playlists or one native call per row.
export function useNativeAudioCacheBadges(model: NativePageModel | null, active: boolean) {
    useAudioSettingsStore(s => s.audioQuality);
    useLxSourceStore(s => s.revision);
    const { t } = useTranslation();
    const signature = useMemo(() => {
        const keys = new Set<string>();
        for (const section of model?.sections ?? []) {
            for (const item of section.items ?? []) {
                if (item.audioCacheKey) keys.add(item.audioCacheKey);
                if (keys.size === 100) return [...keys].join('\n');
            }
        }
        return [...keys].join('\n');
    }, [model?.sections]);
    const [snapshot, setSnapshot] = useState<{ signature: string; keys: Set<string> }>({ signature: '', keys: new Set() });
    useEffect(() => {
        if (!active || !isCapacitorAndroid() || !signature) return;
        let alive = true, ticket = 0, timer: ReturnType<typeof setTimeout> | undefined;
        const load = async () => {
            if (document.visibilityState !== 'visible') return;
            const own = ++ticket;
            try {
                const result = await getTingyuPlayback<{ audioOffline(o: object): Promise<{ keys: string[] }> }>().audioOffline({ action: 'contains', keys: signature.split('\n') });
                if (alive && own === ticket) setSnapshot({ signature, keys: new Set(result.keys) });
            } catch { if (alive && own === ticket) setSnapshot({ signature, keys: new Set() }); }
            if (alive && own === ticket) timer = setTimeout(load, 5000);
        };
        const refresh = () => { ticket++; clearTimeout(timer); if (document.visibilityState === 'visible') void load(); };
        document.addEventListener('visibilitychange', refresh); window.addEventListener('tingyu-offline-cache-usage', refresh); void load();
        return () => { alive = false; ticket++; clearTimeout(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('tingyu-offline-cache-usage', refresh); };
    }, [signature, active]);
    return useMemo(() => !model || !signature ? model : {
        ...model, sections: model.sections.map(section => ({ ...section, items: section.items?.map(item => ({
            ...item, audioCached: snapshot.signature === signature && !!item.audioCacheKey && snapshot.keys.has(item.audioCacheKey),
            audioCachedLabel: String(t('audioCache.cachedBadge')),
        })) })),
    }, [model, signature, snapshot, t]);
}

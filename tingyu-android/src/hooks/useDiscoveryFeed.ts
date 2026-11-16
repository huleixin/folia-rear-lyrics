import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { omni } from '../services/onlineMusic/omni';
import { useOnlineProviderAccountStore } from '../stores/useOnlineProviderAccountStore';
import { useDiscoverySettingsStore } from '../stores/useDiscoverySettingsStore';
import { discoverySources, readDiscovery, type DiscoveryResult } from '../services/discovery/service';

export function useDiscoveryFeed(active: boolean) {
    const accounts = useOnlineProviderAccountStore(state => state.accounts);
    const registry = useSyncExternalStore(omni.subscribeProviders, omni.getProviderRegistryVersion);
    const settings = useDiscoverySettingsStore();
    const sources = useMemo(() => discoverySources(), [accounts, registry]);
    const selected = sources.filter(source => settings.source === 'all' ? settings.enabled[source.providerId] !== false : source.providerId === settings.source);
    const owner = JSON.stringify(selected.map(source => [source.providerId, source.user?.id, source.status, source.hydration]));
    const [state, setState] = useState<{ owner: string; results: DiscoveryResult[]; busy: boolean }>({ owner: '', results: [], busy: true });
    const [refresh, setRefresh] = useState(0);
    const songsVisible = ['roam','shortcuts','radars','songs'].some(module => !settings.hidden.includes(module as 'songs'));
    const collectionsVisible = !settings.hidden.includes('collections');
    useEffect(() => {
        if (!active) return;
        const controller = new AbortController();
        setState(previous => ({ owner, results: previous.owner === owner ? previous.results : [], busy: true }));
        void (async () => {
            for (const source of selected) {
                if (controller.signal.aborted) break;
                if (!songsVisible) continue;
                const capability = omni.getRecommendationCapabilities(source.providerId);
                const kind = capability.daily ? 'daily' : 'fm';
                if (!capability[kind]) continue;
                const result = await readDiscovery(source.providerId, kind, controller.signal);
                if (!controller.signal.aborted) setState(previous => ({ owner, busy: true, results: [...previous.results.filter(item => item.providerId !== source.providerId || item.kind !== kind), result] }));
            }
            if (collectionsVisible) for (const source of selected) {
                if (controller.signal.aborted) break;
                const result = await readDiscovery(source.providerId, 'collections', controller.signal);
                if (!controller.signal.aborted) setState(previous => ({ owner, busy: true, results: [...previous.results.filter(item => item.providerId !== source.providerId || item.kind !== 'collections'), result] }));
            }
        })().catch(() => {}).finally(() => { if (!controller.signal.aborted) setState(previous => ({ ...previous, busy: false })); });
        return () => controller.abort();
    // Only source/account identity, never liked IDs or playback progress.
    }, [owner, active, refresh, songsVisible, collectionsVisible]);
    return { sources, results: state.owner === owner ? state.results : [], busy: state.owner !== owner || state.busy, retry: () => setRefresh(value => value + 1), owner };
}

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { omni } from '../services/onlineMusic/omni';
import { useOnlineProviderAccountStore } from '../stores/useOnlineProviderAccountStore';
import {
    useDiscoverySettingsStore,
    computeVisibleDiscoverySources,
    resolveEffectiveDiscoverySource,
} from '../stores/useDiscoverySettingsStore';
import { discoverySources, readDiscovery, type DiscoveryResult } from '../services/discovery/service';

export function useDiscoveryFeed(active: boolean) {
    const accounts = useOnlineProviderAccountStore(state => state.accounts);
    const registry = useSyncExternalStore(omni.subscribeProviders, omni.getProviderRegistryVersion);
    const settings = useDiscoverySettingsStore();
    const sources = useMemo(() => discoverySources(), [accounts, registry]);
    const allSourceTabs = useMemo(
        () => [...sources, { providerId: 'local', displayName: '本地音乐' }],
        [sources],
    );
    const visibleSourceTabs = useMemo(
        () => computeVisibleDiscoverySources(allSourceTabs, settings),
        [allSourceTabs, settings.sourceOrder, settings.enabled],
    );
    const visibleSources = useMemo(
        () => computeVisibleDiscoverySources(sources, settings),
        [sources, settings.sourceOrder, settings.enabled],
    );
    const effectiveSource = resolveEffectiveDiscoverySource(settings);
    const selected = useMemo(
        () => effectiveSource === 'all'
            ? visibleSources
            : visibleSources.filter(source => source.providerId === effectiveSource),
        [visibleSources, effectiveSource],
    );

    // Canonical owner key sorted by providerId so reordering sourceOrder updates UI immediately
    // without invalidating cached results or re-fetching all providers.
    const owner = useMemo(
        () => JSON.stringify(
            [...selected]
                .sort((a, b) => a.providerId.localeCompare(b.providerId))
                .map(source => [source.providerId, source.user?.id, source.status, source.hydration]),
        ),
        [selected],
    );

    const [state, setState] = useState<{ owner: string; results: DiscoveryResult[]; busy: boolean }>({
        owner: '',
        results: [],
        busy: true,
    });
    const [refresh, setRefresh] = useState(0);
    const songsVisible = ['roam', 'shortcuts', 'radars', 'songs'].some(module => !settings.hidden.includes(module as 'songs'));
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
                if (!controller.signal.aborted) {
                    setState(previous => ({
                        owner,
                        busy: true,
                        results: [...previous.results.filter(item => item.providerId !== source.providerId || item.kind !== kind), result],
                    }));
                }
            }
            if (collectionsVisible) {
                for (const source of selected) {
                    if (controller.signal.aborted) break;
                    const result = await readDiscovery(source.providerId, 'collections', controller.signal);
                    if (!controller.signal.aborted) {
                        setState(previous => ({
                            owner,
                            busy: true,
                            results: [...previous.results.filter(item => item.providerId !== source.providerId || item.kind !== 'collections'), result],
                        }));
                    }
                }
            }
        })().catch(() => {}).finally(() => {
            if (!controller.signal.aborted) setState(previous => ({ ...previous, busy: false }));
        });
        return () => controller.abort();
        // Only source/account identity, never liked IDs, sourceOrder, or playback progress.
    }, [owner, active, refresh, songsVisible, collectionsVisible]);

    const orderedResults = useMemo(() => {
        if (state.owner !== owner) return [];
        const rank = new Map(visibleSources.map((s, idx) => [s.providerId, idx]));
        return [...state.results].sort((a, b) => (rank.get(a.providerId) ?? 999) - (rank.get(b.providerId) ?? 999));
    }, [state.owner, state.results, owner, visibleSources]);

    return {
        sources,
        visibleSources,
        visibleSourceTabs,
        results: orderedResults,
        busy: effectiveSource === 'local' ? false : (state.owner !== owner || state.busy),
        retry: () => setRefresh(value => value + 1),
        owner,
    };
}

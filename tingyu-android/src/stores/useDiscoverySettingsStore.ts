import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const discoveryModules = ['roam', 'shortcuts', 'radars', 'songs', 'collections', 'recent', 'playlists'] as const;
export type DiscoveryModule = typeof discoveryModules[number];
export type DiscoverySettings = {
    source: string;
    sourceOrder: string[];
    enabled: Record<string, boolean>;
    weights: Record<string, number>;
    includeLocal: boolean;
    hideUnloggedInPrompts: boolean;
    exploration: number;
    crossArtist: number;
    familiarity: number;
    record: boolean;
    modules: DiscoveryModule[];
    hidden: DiscoveryModule[];
};

export const defaultDiscoverySettings: DiscoverySettings = {
    source: 'all',
    sourceOrder: [],
    enabled: {},
    weights: {},
    includeLocal: true,
    hideUnloggedInPrompts: true,
    exploration: .2,
    crossArtist: .3,
    familiarity: .5,
    record: true,
    modules: [...discoveryModules],
    hidden: [],
};

/** Merges saved discovery sourceOrder with available providers, keeping disabled/hidden positions intact. */
export function computeDiscoverySourceOrder(
    savedOrder: readonly string[] | undefined,
    availableProviderIds: readonly string[],
): string[] {
    const availableSet = new Set(availableProviderIds);
    const saved: string[] = [];
    const seen = new Set<string>();
    for (const id of savedOrder ?? []) {
        if (availableSet.has(id) && !seen.has(id)) {
            seen.add(id);
            saved.push(id);
        }
    }
    for (const id of availableProviderIds) {
        if (!seen.has(id)) {
            seen.add(id);
            saved.push(id);
        }
    }
    return saved;
}

/** Returns enabled discovery sources sorted strictly by the user's configured sourceOrder. */
export function computeVisibleDiscoverySources<T extends { providerId: string }>(
    sources: readonly T[],
    settings: Pick<DiscoverySettings, 'sourceOrder' | 'enabled'>,
): T[] {
    const byId = new Map(sources.map(item => [item.providerId, item]));
    const order = computeDiscoverySourceOrder(settings.sourceOrder, sources.map(item => item.providerId));
    const visible: T[] = [];
    for (const id of order) {
        if (settings.enabled[id] === false) continue;
        const found = byId.get(id);
        if (found) visible.push(found);
    }
    return visible;
}

/** Resolves effective active recommendation source; falls back to 'all' if current source is hidden/disabled. */
export function resolveEffectiveDiscoverySource(
    settings: Pick<DiscoverySettings, 'source' | 'enabled'>,
): string {
    if (settings.source === 'all' || settings.source === 'local') return settings.source;
    if (settings.enabled[settings.source] === false) return 'all';
    return settings.source;
}

type Store = DiscoverySettings & { patch: (patch: Partial<DiscoverySettings>) => void; reset: () => void };

export const useDiscoverySettingsStore = create<Store>()(persist(set => ({
    ...defaultDiscoverySettings,
    patch: patch => set(patch),
    reset: () => set(defaultDiscoverySettings),
}), {
    name: 'tingyu_discovery_settings_v1',
    version: 1,
    merge: (persisted, current) => {
        const saved = (persisted && typeof persisted === 'object') ? persisted as Partial<DiscoverySettings> : {};
        return {
            ...current,
            ...saved,
            sourceOrder: Array.isArray(saved.sourceOrder)
                ? saved.sourceOrder.filter((id): id is string => typeof id === 'string' && id.length > 0)
                : current.sourceOrder,
            enabled: saved.enabled && typeof saved.enabled === 'object' ? saved.enabled : current.enabled,
            weights: saved.weights && typeof saved.weights === 'object' ? saved.weights : current.weights,
        };
    },
}));

export function useDiscoverySettingsHydrated(): boolean {
    const [hydrated, setHydrated] = useState(() => useDiscoverySettingsStore.persist.hasHydrated());
    useEffect(() => {
        if (hydrated) return;
        const unsub = useDiscoverySettingsStore.persist.onFinishHydration(() => setHydrated(true));
        if (useDiscoverySettingsStore.persist.hasHydrated()) setHydrated(true);
        return unsub;
    }, [hydrated]);
    return hydrated;
}

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { omni } from '../services/onlineMusic/omni';

// src/stores/useSearchSettingsStore.ts
export type SearchSort = 'relevance' | 'local' | 'provider';
export const useSearchSettingsStore = create<{
    disabled: string[]; priority: string; sort: SearchSort;
    toggle(source: string): void; setPriority(source: string): void; setSort(sort: SearchSort): void;
}>()(persist(set => ({ disabled: [], priority: '', sort: 'relevance',
    toggle: source => set(state => ({ disabled: state.disabled.includes(source) ? state.disabled.filter(id => id !== source) : [...state.disabled, source] })),
    setPriority: priority => set({ priority }), setSort: sort => set({ sort }),
}), { name: 'tingyu-search-settings-v1', partialize: state => ({ disabled: state.disabled, priority: state.priority, sort: state.sort }),
    merge: (persisted, state) => {
        const raw = persisted as Partial<typeof state> | null;
        return { ...state, disabled: Array.isArray(raw?.disabled) ? raw.disabled.filter(id => typeof id === 'string').slice(0, 64) : [],
            priority: typeof raw?.priority === 'string' ? raw.priority : '',
            sort: raw?.sort === 'local' || raw?.sort === 'provider' ? raw.sort : 'relevance' };
    },
}));

export function searchableSources(): string[] {
    const online = omni.getProviderSummaries().filter(provider => {
        try { return provider.availability.configured && omni.getSearchCapabilities(provider.providerId).song; }
        catch { return false; }
    }).map(provider => provider.providerId);
    return [...online, 'local'];
}
export function aggregateSearchSources(): string[] {
    const settings = useSearchSettingsStore.getState();
    return searchableSources().filter(id => !settings.disabled.includes(id)).sort((a, b) =>
        Number(b === settings.priority) - Number(a === settings.priority));
}

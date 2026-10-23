import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// src/stores/useSearchHistoryStore.ts

export const rememberSearch = (previous: string[], query: string): string[] => {
    const term = query.trim().slice(0, 160);
    return term ? [term, ...previous.filter(value => value.toLocaleLowerCase() !== term.toLocaleLowerCase())].slice(0, 20) : previous;
};

type SearchHistory = {
    terms: Record<string, string[]>;
    remember: (source: string, query: string) => void;
    remove: (source: string, query: string) => void;
    clear: (source: string) => void;
};

export const useSearchHistoryStore = create<SearchHistory>()(persist((set) => ({
    terms: {},
    remember: (source, query) => set(state => ({ terms: {
        ...state.terms, [source]: rememberSearch(state.terms[source] ?? [], query),
    } })),
    remove: (source, query) => set(state => ({ terms: {
        ...state.terms, [source]: (state.terms[source] ?? []).filter(term => term !== query),
    } })),
    clear: source => set(state => ({ terms: { ...state.terms, [source]: [] } })),
}), {
    name: 'folia-search-terms-v1',
    partialize: state => ({ terms: state.terms }),
    merge: (persisted, current) => {
        const raw = (persisted as { terms?: Record<string, unknown> } | null)?.terms;
        const terms: Record<string, string[]> = {};
        for (const source of ['netease', 'qq', 'kugou', 'bodian', 'local', 'navidrome']) {
            const values = raw?.[source];
            if (Array.isArray(values)) terms[source] = values.filter((value): value is string => typeof value === 'string' && value.length <= 160).slice(0, 20);
        }
        return { ...current, terms };
    },
}));

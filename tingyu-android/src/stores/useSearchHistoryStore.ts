import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// src/stores/useSearchHistoryStore.ts

export const rememberSearch = (previous: string[], query: string): string[] => {
    const term = query.trim().slice(0, 160);
    return term ? [term, ...previous.filter(value => value.toLocaleLowerCase() !== term.toLocaleLowerCase())].slice(0, 20) : previous;
};

type SearchHistory = {
    terms: Record<string, string[]>;
    recording: boolean;
    setRecording: (enabled: boolean) => void;
    remember: (source: string, query: string) => void;
    remove: (source: string, query: string) => void;
    clear: (source: string) => void;
    clearAll: () => void;
};

/** Keep old and extension source histories, with bounded, prototype-safe keys. */
export function sanitizeSearchHistory(raw: unknown): Record<string, string[]> {
    const terms: Record<string, string[]> = {};
    if (!raw || typeof raw !== 'object') return terms;
    for (const [source, values] of Object.entries(raw).slice(0, 64)) {
        if (!/^[a-z][a-z0-9_-]{0,63}$/.test(source) || ['constructor', 'prototype', '__proto__'].includes(source) || !Array.isArray(values)) continue;
        terms[source] = values.slice(0, 80).filter((value): value is string => typeof value === 'string' && value.length <= 160)
            .reduceRight((history, term) => rememberSearch(history, term), [] as string[]);
    }
    return terms;
}

export const useSearchHistoryStore = create<SearchHistory>()(persist((set) => ({
    terms: {},
    recording: true,
    setRecording: recording => set({ recording }),
    remember: (source, query) => set(state => !state.recording || !/^[a-z][a-z0-9_-]{0,63}$/.test(source) || ['constructor','prototype','__proto__'].includes(source) || !(source in state.terms) && Object.keys(state.terms).length >= 64 ? state : ({ terms: {
        ...state.terms, [source]: rememberSearch(state.terms[source] ?? [], query),
    } })),
    remove: (source, query) => set(state => ({ terms: {
        ...state.terms, [source]: (state.terms[source] ?? []).filter(term => term !== query),
    } })),
    clear: source => set(state => ({ terms: { ...state.terms, [source]: [] } })),
    clearAll: () => set({ terms: {} }),
}), {
    name: 'folia-search-terms-v1',
    partialize: state => ({ terms: state.terms, recording: state.recording }),
    merge: (persisted, current) => {
        const raw = persisted as { terms?: unknown; recording?: unknown } | null;
        return { ...current, terms: sanitizeSearchHistory(raw?.terms), recording: raw?.recording !== false };
    },
}));

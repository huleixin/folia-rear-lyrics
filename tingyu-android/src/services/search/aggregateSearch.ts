import type { SearchPage } from '../../types/search';
import { searchRequestBudget } from './searchRequestBudget';

// src/services/search/aggregateSearch.ts
export interface SourcePage<T> {
    items: T[]; offset: number; hasMore: boolean;
    status: 'loading' | 'ready' | 'error'; error: string | null;
}
export type SourcePages<T> = Record<string, SourcePage<T>>;
const waiting: Array<() => void> = [];
let active = 0;

// Songs and catalog categories share one bounded request lane. Cancelled queued work never calls a provider.
async function scheduled<T>(task: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
    if (active >= 3) await new Promise<void>(resolve => waiting.push(resolve));
    else active++;
    try { return await searchRequestBudget(task, undefined, signal); }
    finally { const next = waiting.shift(); if (next) next(); else active--; }
}

export async function searchSources<T>(options: {
    sources: string[]; previous?: SourcePages<T>; signal: AbortSignal;
    fetch(source: string, offset: number, signal: AbortSignal): Promise<SearchPage<T>>;
    key(item: T): string; valid(): boolean; publish(pages: SourcePages<T>): void;
}): Promise<void> {
    const pages: SourcePages<T> = { ...options.previous };
    const sources = options.sources.filter(source => !pages[source] || pages[source].hasMore || pages[source].status === 'error');
    for (const source of sources) pages[source] = { items: pages[source]?.items ?? [], offset: pages[source]?.offset ?? 0,
        hasMore: pages[source]?.hasMore ?? false, status: 'loading', error: null };
    if (!options.signal.aborted && options.valid()) options.publish({ ...pages });
    await Promise.allSettled(sources.map(async source => {
        const previous = pages[source];
        try {
            const result = await scheduled(signal => options.fetch(source, previous.offset, signal), options.signal);
            const seen = new Set<string>();
            const items = [...previous.items, ...result.items].filter(item => {
                const key = options.key(item); if (seen.has(key)) return false; seen.add(key); return true;
            });
            pages[source] = { items, offset: result.nextOffset, hasMore: result.hasMore && result.nextOffset > previous.offset,
                status: 'ready', error: null };
        } catch (error) {
            pages[source] = { ...previous, status: 'error', error: error instanceof Error ? error.message : 'search_failed' };
        }
        if (!options.signal.aborted && options.valid()) options.publish({ ...pages });
    }));
}

// Preserve already presented order as providers arrive; explicit submission can establish a new ranking.
export function appendSourceResults<T>(previous: T[], pages: SourcePages<T>, key: (item: T) => string): T[] {
    const seen = new Set<string>();
    return [...previous, ...Object.values(pages).flatMap(page => page.items)].filter(item => {
        const id = key(item); if (seen.has(id)) return false; seen.add(id); return true;
    });
}

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { omni } from '../../../services/onlineMusic/omni';
import { useOnlineProviderAccountStore } from '../../../stores/useOnlineProviderAccountStore';
import { unifiedLibrary, libraryScope, invalidateUnifiedLibrary } from '../services/unifiedLibrarySource';
import type { LibraryPageState, LibraryResource } from '../services/unifiedLibrary';

// src/library/core/bindings/useUnifiedLibrary.ts
const CACHE_KEY = 'tingyu_unified_library_swr_v1';
const CACHE_TTL_MS = 3 * 60_000;
const memoryCache = new Map<string, { pages: Record<string, LibraryPageState>; updatedAt: number }>();

function readCachedPages(owner: string): { pages: Record<string, LibraryPageState>; updatedAt: number } | null {
    const mem = memoryCache.get(owner);
    if (mem) return mem;
    try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Record<string, { pages: Record<string, LibraryPageState>; updatedAt: number }>;
        const hit = parsed?.[owner];
        if (hit && hit.pages && typeof hit.updatedAt === 'number') {
            memoryCache.set(owner, hit);
            return hit;
        }
    } catch { /* Ignore corrupt storage. */ }
    return null;
}

function writeCachedPages(owner: string, pages: Record<string, LibraryPageState>) {
    const entry = { pages, updatedAt: Date.now() };
    memoryCache.set(owner, entry);
    try {
        if (typeof localStorage === 'undefined') return;
        const raw = localStorage.getItem(CACHE_KEY);
        const parsed = raw ? (JSON.parse(raw) as Record<string, { pages: Record<string, LibraryPageState>; updatedAt: number }>) : {};
        const keys = Object.keys(parsed);
        if (keys.length > 12) delete parsed[keys[0]];
        parsed[owner] = entry;
        localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
    } catch { /* Ignore quota errors. */ }
}

/** Cache-first unified library hook: never clears valid cache on navigation/layout changes. */
export function useUnifiedLibrary(active: boolean, source: string, resource: LibraryResource) {
    const accounts = useOnlineProviderAccountStore(state => state.accounts);
    const registry = useSyncExternalStore(omni.subscribeProviders, omni.getProviderRegistryVersion);
    const providers = useMemo(() => omni.getProviderSummaries().filter(item => item.availability.configured
        && Object.values(omni.getLibraryCapabilities(item.providerId)).some(Boolean)), [accounts, registry]);
    const ids = providers.filter(item => source === 'all' || item.providerId === source).map(item => item.providerId);
    const owner = JSON.stringify([resource, ids.map(id => [id, libraryScope(id)])]);

    const [snapshot, setSnapshot] = useState<{ owner: string; pages: Record<string, LibraryPageState> }>(() => {
        const cached = readCachedPages(owner);
        return cached ? { owner, pages: cached.pages } : { owner: '', pages: {} };
    });
    const [syncing, setSyncing] = useState(false);
    const [refresh, setRefresh] = useState(0);
    const controller = useRef<AbortController | null>(null);
    const busy = useRef(new Set<string>());

    const visible = snapshot.owner === owner
        ? snapshot.pages
        : (readCachedPages(owner)?.pages ?? {});

    useEffect(() => {
        const task = new AbortController();
        controller.current = task;
        busy.current = new Set();
        if (!active) return () => task.abort();

        const cached = readCachedPages(owner);
        if (cached) {
            setSnapshot({ owner, pages: cached.pages });
            const isFresh = Date.now() - cached.updatedAt < CACHE_TTL_MS && refresh === 0;
            if (isFresh) return () => task.abort();
        } else {
            setSnapshot({ owner, pages: {} });
        }

        setSyncing(true);
        const holdInitialBatch = !cached && ids.length > 1;
        const buffered: Record<string, LibraryPageState> = {};
        let batchFlushed = !holdInitialBatch;
        const flushBatch = () => {
            if (batchFlushed || task.signal.aborted) return;
            batchFlushed = true;
            if (!Object.keys(buffered).length) return;
            setSnapshot(previous => {
                const base = previous.owner === owner ? previous.pages : {};
                const nextPages = { ...base, ...buffered };
                writeCachedPages(owner, nextPages);
                return { owner, pages: nextPages };
            });
        };
        const safetyTimer = holdInitialBatch ? setTimeout(flushBatch, 1200) : null;

        void unifiedLibrary.load(ids, resource, page => {
            if (task.signal.aborted) return;
            if (!batchFlushed) {
                buffered[page.providerId] = page;
                if (ids.every(id => Boolean(buffered[id]))) {
                    if (safetyTimer) clearTimeout(safetyTimer);
                    flushBatch();
                }
                return;
            }
            setSnapshot(previous => {
                const base = previous.owner === owner ? previous.pages : (readCachedPages(owner)?.pages ?? {});
                const prevPage = base[page.providerId];
                // Do not overwrite valid cached items if a background refresh errors out.
                const nextPage = page.status === 'error' && prevPage?.items?.length ? prevPage : page;
                const nextPages = { ...base, [page.providerId]: nextPage };
                writeCachedPages(owner, nextPages);
                return { owner, pages: nextPages };
            });
        }, task.signal).finally(() => {
            if (safetyTimer) clearTimeout(safetyTimer);
            flushBatch();
            if (!task.signal.aborted) setSyncing(false);
        });
        return () => {
            if (safetyTimer) clearTimeout(safetyTimer);
            task.abort();
        };
    }, [active, owner, refresh]);

    const more = async (id: string) => {
        const previous = visible[id], task = controller.current;
        if (!active || !task || task.signal.aborted || !previous?.hasMore || busy.current.has(id)) return;
        const pending = busy.current;
        pending.add(id);
        try {
            const next = await unifiedLibrary.page(id, resource, { offset: previous.nextOffset, signal: task.signal });
            if (task.signal.aborted) return;
            setSnapshot(current => {
                if (current.owner !== owner) return current;
                const old = current.pages[id];
                if (!old) return current;
                const seen = new Set(old.items.map(item => JSON.stringify([item.type, item.id])));
                const added = next.items.filter(item => !seen.has(JSON.stringify([item.type, item.id])));
                const nextPages = {
                    ...current.pages,
                    [id]: next.status === 'error'
                        ? { ...old, status: 'error' as const }
                        : { ...next, items: [...old.items, ...added], hasMore: next.hasMore && added.length > 0 },
                };
                writeCachedPages(owner, nextPages);
                return { owner, pages: nextPages };
            });
        } catch { /* Account changes and cancellation intentionally discard results. */ }
        finally { pending.delete(id); }
    };

    const hasCached = Object.keys(visible).length > 0;
    return {
        providers,
        syncing,
        hasCached,
        accountKey: (id: string) => String(libraryScope(id).userId),
        pages: ids.map(id => visible[id] ?? { providerId: id, resource, status: 'loading' as const, items: [], hasMore: false, nextOffset: 0 }),
        owner,
        more,
        retry: () => { ids.forEach(invalidateUnifiedLibrary); setRefresh(value => value + 1); },
    };
}

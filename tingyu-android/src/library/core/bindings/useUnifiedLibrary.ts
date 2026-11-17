import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { omni } from '../../../services/onlineMusic/omni';
import { useOnlineProviderAccountStore } from '../../../stores/useOnlineProviderAccountStore';
import { unifiedLibrary, libraryScope, invalidateUnifiedLibrary } from '../services/unifiedLibrarySource';
import type { LibraryPageState, LibraryResource } from '../services/unifiedLibrary';

// src/library/core/bindings/useUnifiedLibrary.ts
/** Scoped pages publish independently; stale owners are hidden before effects run. */
export function useUnifiedLibrary(active: boolean, source: string, resource: LibraryResource) {
    const accounts = useOnlineProviderAccountStore(state => state.accounts);
    const registry = useSyncExternalStore(omni.subscribeProviders, omni.getProviderRegistryVersion);
    const providers = useMemo(() => omni.getProviderSummaries().filter(item => item.availability.configured
        && Object.values(omni.getLibraryCapabilities(item.providerId)).some(Boolean)), [accounts, registry]);
    const ids = providers.filter(item => source === 'all' || item.providerId === source).map(item => item.providerId);
    const owner = JSON.stringify([resource, ids.map(id => [id, libraryScope(id)])]);
    const [snapshot, setSnapshot] = useState<{ owner: string; pages: Record<string, LibraryPageState> }>({ owner: '', pages: {} });
    const [refresh, setRefresh] = useState(0);
    const controller = useRef<AbortController | null>(null);
    const busy = useRef(new Set<string>());
    const visible = snapshot.owner === owner ? snapshot.pages : {};
    useEffect(() => {
        const task = new AbortController(); controller.current = task; busy.current = new Set();
        if (!active) return () => task.abort();
        setSnapshot({ owner, pages: {} });
        void unifiedLibrary.load(ids, resource, page => {
            if (!task.signal.aborted) setSnapshot(previous => ({ owner, pages: { ...(previous.owner === owner ? previous.pages : {}), [page.providerId]: page } }));
        }, task.signal);
        return () => task.abort();
        // owner contains every provider/account/resource dependency.
    }, [active, owner, refresh]);
    const more = async (id: string) => {
        const previous = visible[id], task = controller.current;
        if (!active || !task || task.signal.aborted || !previous?.hasMore || busy.current.has(id)) return;
        const pending = busy.current; pending.add(id);
        try {
            const next = await unifiedLibrary.page(id, resource, { offset: previous.nextOffset, signal: task.signal });
            if (task.signal.aborted) return;
            setSnapshot(current => {
                if (current.owner !== owner) return current;
                const old = current.pages[id];
                if (!old) return current;
                const seen = new Set(old.items.map(item => JSON.stringify([item.type, item.id])));
                const added = next.items.filter(item => !seen.has(JSON.stringify([item.type, item.id])));
                return { owner, pages: { ...current.pages, [id]: next.status === 'error'
                    ? { ...old, status: 'error' } : { ...next, items: [...old.items, ...added], hasMore: next.hasMore && added.length > 0 } } };
            });
        } catch { /* Account changes and cancellation intentionally discard results. */ }
        finally { pending.delete(id); }
    };
    return { providers, accountKey: (id: string) => String(libraryScope(id).userId), pages: ids.map(id => visible[id] ?? { providerId: id, resource, status: 'loading' as const, items: [], hasMore: false, nextOffset: 0 }), owner, more,
        retry: () => { ids.forEach(invalidateUnifiedLibrary); setRefresh(value => value + 1); } };
}

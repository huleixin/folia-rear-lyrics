import type { MediaId, ProviderCollection, ProviderPage } from '../../../types/onlineMusic';
import { DiscoveryRequestCache } from '../../../services/discovery/requestCache';

// src/library/core/services/unifiedLibrary.ts
export type LibraryResource = 'playlists' | 'albums';
export type LibraryScope = { userId: MediaId | null; generation: number; ready: boolean; authenticated: boolean };
export type LibraryPageState = ProviderPage<ProviderCollection> & {
    providerId: string;
    resource: LibraryResource;
    status: 'loading' | 'ready' | 'empty' | 'login' | 'unsupported' | 'error';
};
export interface LibraryReader {
    scope(providerId: string): LibraryScope;
    supports(providerId: string, resource: LibraryResource): boolean;
    read(providerId: string, userId: MediaId, resource: LibraryResource, limit: number, offset: number): Promise<ProviderPage<ProviderCollection>>;
}

const cancelled = () => new DOMException('Library scope changed', 'AbortError');
const scopeKey = (scope: LibraryScope) => JSON.stringify(scope);

/** Shared bounded requests; consumer cancellation never releases an unfinished transport slot. */
export class UnifiedLibrary {
    private cache = new DiscoveryRequestCache(2, 80);
    constructor(private reader: LibraryReader, private timeoutMs = 15_000) {}

    async page(providerId: string, resource: LibraryResource, options: {
        offset?: number; limit?: number; signal?: AbortSignal;
    } = {}): Promise<LibraryPageState> {
        const offset = Math.max(0, Math.floor(options.offset || 0));
        const limit = Math.min(100, Math.max(1, Math.floor(options.limit || 50)));
        const scope = this.reader.scope(providerId);
        const base = { providerId, resource, items: [], hasMore: false, nextOffset: offset };
        if (options.signal?.aborted) throw cancelled();
        if (!scope.ready) return { ...base, status: 'loading' };
        if (!scope.authenticated || scope.userId === null) return { ...base, status: 'login' };
        if (!this.reader.supports(providerId, resource)) return { ...base, status: 'unsupported' };
        const identity = scopeKey(scope);
        const current = () => identity === scopeKey(this.reader.scope(providerId));
        const controller = new AbortController();
        const abort = () => controller.abort();
        options.signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(abort, this.timeoutMs);
        try {
            const key = JSON.stringify(['library-v2', providerId, identity, resource, limit, offset]);
            const page = await this.cache.read(key, 60_000, async () => {
                // A task queued behind another platform must not start with that account's old credentials.
                if (!current()) throw cancelled();
                const result = await this.reader.read(providerId, scope.userId!, resource, limit, offset);
                if (!current()) throw cancelled();
                return result;
            }, controller.signal);
            if (!current() || options.signal?.aborted) throw cancelled();
            const seen = new Set<string>();
            const items = page.items.filter(item => {
                const id = JSON.stringify([item.providerId, item.type, item.id]);
                if (item.providerId !== providerId || seen.has(id)) return false;
                seen.add(id);
                return true;
            });
            return { ...page, providerId, resource, items,
                hasMore: page.hasMore && Number.isFinite(page.nextOffset) && page.nextOffset > offset,
                status: items.length ? 'ready' : 'empty' };
        } catch (error) {
            if (!current() || options.signal?.aborted) throw cancelled();
            return { ...base, status: 'error' };
        } finally {
            clearTimeout(timer);
            options.signal?.removeEventListener('abort', abort);
        }
    }

    /** Publishes each source as it completes, retaining source order in the final snapshot. */
    async load(providerIds: string[], resource: LibraryResource, publish: (page: LibraryPageState) => void,
        signal?: AbortSignal): Promise<LibraryPageState[]> {
        const results = await Promise.allSettled([...new Set(providerIds)].map(async providerId => {
            const page = await this.page(providerId, resource, { signal });
            if (!signal?.aborted) publish(page);
            return page;
        }));
        return results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    }
}

import { omni } from '../onlineMusic/omni';
import { providerSearchScopeKey } from '../onlineMusic/providerResourceScope';
import { aggregateSearchSources } from '../../stores/useSearchSettingsStore';
import type { SearchSource } from '../../stores/useSearchNavigationStore';

// src/services/search/searchAuxiliary.ts
export type SearchDiscovery = { suggestions: string[]; hot: string[]; providerId: string | null };
const cache = new Map<string, { data: SearchDiscovery; saved: number }>();
const pending = new Map<string, Promise<SearchDiscovery>>();

/** A single real provider serves auxiliary data; aggregate is never sent to a provider. */
export function searchAuxiliarySource(source: SearchSource, kind: 'suggest' | 'discovery'): string | null {
    if (source === 'local' || source === 'navidrome') return null;
    const choices = source === 'aggregate' ? aggregateSearchSources() : [source];
    return choices.find(id => id !== 'local' && id !== 'navidrome' && (kind === 'discovery'
        ? omni.supportsSearchDiscovery(id) : omni.getSearchCapabilities(id).suggest)) ?? null;
}
export function searchAuxiliaryKey(source: SearchSource, kind: 'suggest' | 'discovery'): string {
    const provider = searchAuxiliarySource(source, kind);
    return JSON.stringify([source, provider, providerSearchScopeKey(provider ? [provider] : [])]);
}
export function clearSearchDiscoveryCache(): void { cache.clear(); pending.clear(); }
export function loadSearchDiscovery(source: SearchSource): Promise<SearchDiscovery> {
    const providerId = searchAuxiliarySource(source, 'discovery');
    if (!providerId) return Promise.resolve({ suggestions: [], hot: [], providerId: null });
    const key = searchAuxiliaryKey(source, 'discovery');
    const saved = cache.get(key);
    if (saved && Date.now() - saved.saved < 600_000) return Promise.resolve(saved.data);
    const existing = pending.get(key);
    if (existing) return existing;
    let timer: ReturnType<typeof setTimeout>;
    const request = Promise.race([
        omni.getSearchDiscovery(providerId),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Search discovery timed out')), 8000); }),
    ]).then(result => {
        const data = { ...result, providerId };
        if (key === searchAuxiliaryKey(source, 'discovery') && pending.get(key) === request) {
            cache.set(key, { data, saved: Date.now() });
            if (cache.size > 40) cache.delete(cache.keys().next().value!);
        }
        return data;
    }).finally(() => { clearTimeout(timer); if (pending.get(key) === request) pending.delete(key); });
    pending.set(key, request);
    return request;
}

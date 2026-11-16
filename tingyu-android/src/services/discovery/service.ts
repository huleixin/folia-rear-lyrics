import { omni } from '../onlineMusic/omni';
import type { SongResult } from '../../types';
import type { ProviderCollection } from '../../types/onlineMusic';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import { DiscoveryRequestCache } from './requestCache';

export type DiscoveryKind = 'daily' | 'fm' | 'collections';
export type DiscoveryResult = { providerId: string; kind: DiscoveryKind; songs: SongResult[];
    collections: ProviderCollection[]; status: 'ready' | 'empty' | 'error' | 'login' | 'loading' | 'unsupported' };
const requests = new DiscoveryRequestCache();
export const discoveryDay = () => new Date().toLocaleDateString('sv-SE');
export function discoverySources() {
    return omni.getProviderSummaries().filter(source => source.availability.configured
        && Object.values(omni.getRecommendationCapabilities(source.providerId)).some(Boolean));
}
export function discoveryOwner(providerId: string) {
    const source = omni.getProviderSummaries().find(item => item.providerId === providerId);
    return JSON.stringify([providerId, source?.user?.id ?? 'guest', source?.status, source?.hydration]);
}
export async function readDiscovery(providerId: string, kind: DiscoveryKind, signal?: AbortSignal): Promise<DiscoveryResult> {
    const base = { providerId, kind, songs: [], collections: [] };
    const source = discoverySources().find(item => item.providerId === providerId);
    if (!source || !omni.getRecommendationCapabilities(providerId)[kind]) return { ...base, status: 'unsupported' };
    if (source.hydration !== 'ready' && source.requiresAccount) return { ...base, status: 'loading' };
    if (kind !== 'collections' && source.requiresAccount && source.status !== 'authenticated') return { ...base, status: 'login' };
    const owner = discoveryOwner(providerId);
    const key = JSON.stringify(['discovery-v1', owner, kind, discoveryDay(), 20]);
    try {
        const result = await requests.read<DiscoveryResult>(key, kind === 'daily' ? 6 * 3600_000 : 15 * 60_000, async () => {
            const collections = kind === 'collections' ? await omni.getProviderRecommendedCollections(providerId, 20) : [];
            const songs = kind === 'daily' ? await omni.getProviderDailySongs(providerId)
                : kind === 'fm' ? await omni.getProviderPersonalFm(providerId) : [];
            const seen = new Set<string>();
            const unique = songs.filter(song => { const id = getPlaybackSongKey(song); if (seen.has(id)) return false; seen.add(id); return true; });
            return { providerId, kind, songs: unique, collections, status: unique.length || collections.length ? 'ready' : 'empty' };
        }, signal);
        if (signal?.aborted || discoveryOwner(providerId) !== owner) throw new DOMException('Owner changed', 'AbortError');
        return result;
    } catch (error) {
        if ((error as Error)?.name === 'AbortError') throw error;
        return { ...base, status: 'error' };
    }
}

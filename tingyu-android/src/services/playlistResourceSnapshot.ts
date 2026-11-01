import { isCapacitorAndroid } from '../platform/runtime';
import { getTingyuPlayback } from '../platform/tingyuPlayback';
import type { NativePlaylistTrackPayload } from './nativePlaylistSync';

// src/services/playlistResourceSnapshot.ts
interface SnapshotBridge {
    resourceCache?(o: { currentKey: string }): Promise<{ containsCurrent?: boolean; descriptor?: unknown; playlistId?: string }>;
    resourceSnapshot(o: { playlistId: string; begin?: boolean; finish?: boolean; offset: number; tracks: NativePlaylistTrackPayload[]; currentKey?: string; catalogComplete?: boolean }): Promise<void>;
}
let playbackOrigin:{keys:Set<string>;origin:unknown}|null=null;
export const rememberResourceCollectionOrigin=(keys:Set<string>,origin:unknown)=>{
    playbackOrigin={keys,origin};
    if(typeof window!=='undefined')window.dispatchEvent(new Event('tingyu-playback-origin'));
};
let collectionOwner: { token: string; keys: Set<string>; origin?: unknown } | null = null;
export const claimResourceCollection = (token: string, keys: Set<string>, origin?: unknown) => { collectionOwner = { token, keys, origin }; revision++;if(origin)rememberResourceCollectionOrigin(keys,origin); };
export const resourceCollectionOrigin = (key:string):unknown => playbackOrigin?.keys.has(key)?playbackOrigin.origin:collectionOwner?.keys.has(key)?collectionOwner.origin??{playlistId:collectionOwner.token}:null;
export const isResourceCollectionOwner = (token: string) => collectionOwner?.token === token;
export const releaseResourceCollection = (token: string) => { if (collectionOwner?.token === token) collectionOwner = null; };
let revision = 0;
let lastIdentity = '';
/** Stable compact identity; tasks contain display metadata, never resolved audio or credentials. */
export const resourceSnapshotIdentity = (keys: readonly string[]): string => {
    let hash = 2166136261;
    for (const key of keys) for (let i = 0; i <= key.length; i++) {
        hash ^= i === key.length ? 0 : key.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return 'playlist-' + keys.length + '-' + (hash >>> 0).toString(16);
};
export const syncPlaylistResources = async <T>(
    songs: readonly T[], toPayload: (song: T) => NativePlaylistTrackPayload | null, currentKey: string,
): Promise<void> => {
    if (!isCapacitorAndroid()) return;
    if (collectionOwner?.keys.has(currentKey)) return;
    collectionOwner = null;
    // Only compact identity strings are materialized; resource payloads cross the bridge 50 at a time.
    const identity = resourceSnapshotIdentity(songs.map(song => {
        const item = toPayload(song);
        return item ? item.songKey + '|' + item.artwork : '';
    }));
    if (identity === lastIdentity) return;
    const own = ++revision;
    const bridge = getTingyuPlayback<SnapshotBridge>();
    try {
        const saved = await bridge.resourceCache?.({ currentKey });
        if (saved?.descriptor && saved.containsCurrent) {
            claimResourceCollection(saved.playlistId ?? '', new Set([currentKey]));
            void import('./collectionResourcePrecache').then(module => module.resumeIncompleteCollectionResources(currentKey));
            lastIdentity = identity;
            return;
        }
        await bridge.resourceSnapshot({ playlistId: identity, begin: true, offset: 0, tracks: [] });
        for (let offset = 0; offset < songs.length; offset += 50) {
            if (own !== revision) return;
            const tracks = songs.slice(offset, offset + 50).map(toPayload).filter((v): v is NativePlaylistTrackPayload => v !== null);
            await bridge.resourceSnapshot({
                playlistId: identity, offset, tracks, currentKey,
                finish: offset + 50 >= songs.length, catalogComplete: offset + 50 >= songs.length,
            });
        }
        if (own === revision) {
            lastIdentity = identity;
            void import('./platformResourcePrecache').then(module => module.runPlatformResourcePrecache());
        }
    } catch { /* The next queue synchronization retries an interrupted snapshot. */ }
};

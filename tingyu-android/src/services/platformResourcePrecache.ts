import { getTingyuPlayback } from '../platform/tingyuPlayback';
import { isCapacitorAndroid } from '../platform/runtime';
import { omni } from './onlineMusic/omni';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { readSharedLyricRecord } from './sharedSongResources';
import type { SongResult } from '../types';

// src/services/platformResourcePrecache.ts
interface ResourceTrack {
    songKey: string; providerId: string; mediaId: string; title: string;
    artist: string; album: string; artwork: string; durationMs: number; providerData?: Record<string, unknown>;
}
interface Bridge {
    resourceCandidates(): Promise<{ allowed: boolean; playlistId?:string; tracks: ResourceTrack[] }>;
    resourcePlatformResult(o: { songKey: string; success: boolean; playlistId?:string }): Promise<void>;
}
let running = false;
let installed = false;
let retryTimer:ReturnType<typeof setTimeout>|undefined;
/** Serial higher-fidelity platform enrichment. Native jobs continue independently when JS is suspended. */
export const runPlatformResourcePrecache = async (): Promise<void> => {
    if (!isCapacitorAndroid() || running) return;
    if (!installed && typeof document !== 'undefined') {
        installed = true;
        document.addEventListener('visibilitychange', () => {
            clearTimeout(retryTimer);
            if (document.visibilityState === 'visible') {
                void runPlatformResourcePrecache();
                const song=usePlaybackStore.getState().currentSong;
                if(song)void import('./collectionResourcePrecache').then(module=>module.resumeIncompleteCollectionResources(getPlaybackSongKey(song)));
            }
        });
    }
    running = true;
    const native = getTingyuPlayback<Bridge>();
    try {
        while (typeof document === 'undefined' || document.visibilityState === 'visible') {
            const batch = await native.resourceCandidates();
            if (!batch.allowed || !batch.tracks.length) break;
            for (const track of batch.tracks) {
                const song = {
                    id: track.providerData?.songId ?? track.mediaId, name: track.title,
                    artists: [{ name: track.artist }], album: { name: track.album, coverUrl: track.artwork },
                    durationMs: track.durationMs,
                    sourceRef: { kind: 'online', providerId: track.providerId, mediaId: track.mediaId, providerData: track.providerData },
                } as SongResult;
                let success = false;
                try {
                    const record = await readSharedLyricRecord(song);
                    success = record?.confirmedBy === 'stage' || record?.userChoice === true;
                    if (!success) {
                        await omni.getLyrics(song, { refreshResourceCache: true });
                        const committed = await readSharedLyricRecord(song);
                        success = committed?.confirmedBy === 'stage' || committed?.userChoice === true;
                    }
                } catch { /* Bounded attempts live in the persistent manifest. */ }
                await native.resourcePlatformResult({ songKey: track.songKey, success,playlistId:batch.playlistId });
            }
        }
    } catch { /* Native fallback and completed records stay available. */ }
    finally {
        running = false;
        if(typeof document!=='undefined'&&document.visibilityState==='visible'){
            clearTimeout(retryTimer);retryTimer=setTimeout(()=>void runPlatformResourcePrecache(),300000);
        }
    }
};

import type { LibraryCollectionDescriptor } from '../library/core/contracts/collection';
import type { SongResult } from '../types';
import { isCapacitorAndroid } from '../platform/runtime';
import { getTingyuPlayback } from '../platform/tingyuPlayback';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { omni } from './onlineMusic/omni';
import { toNativeResourcePayload } from './nativePlaylistSync';
import { rememberResourceCollectionOrigin, claimResourceCollection, releaseResourceCollection, isResourceCollectionOwner, resourceSnapshotIdentity } from './playlistResourceSnapshot';

// src/services/collectionResourcePrecache.ts
let generation = 0;
let activeToken = '';
let catalogRunning = false;
/** Pages use the existing Omni catalog API; only display metadata enters the native manifest. */
export const precacheCollectionResources = async (
    collection: LibraryCollectionDescriptor, known: readonly SongResult[], current: SongResult,
): Promise<void> => {
    if (!isCapacitorAndroid()) return;
    if(collection.source!=='online'){rememberResourceCollectionOrigin(new Set(known.map(getPlaybackSongKey)),collection);return;}
    const token = 'collection-' + collection.providerId + '-' + collection.type + '-' + collection.id;
    const signature = token + ':' + resourceSnapshotIdentity(known.map(song => getPlaybackSongKey(song) + '|' + (song.album?.coverUrl ?? '')));
    if (activeToken === signature && isResourceCollectionOwner(token)) return;
    activeToken = signature;
    const own = ++generation;
    catalogRunning = true;
    const native = getTingyuPlayback<{
        resourceCache(o: object): Promise<{ enabled: boolean; networkAllowed: boolean }>;
        resourceSnapshot(o: object): Promise<void>;
    }>();
    const keys = new Set(known.map(getPlaybackSongKey));
    const currentKey = getPlaybackSongKey(current);
    claimResourceCollection(token, keys, collection);
    try {
        const policy = await native.resourceCache({});
        if (!policy.enabled || (own !== generation || !isResourceCollectionOwner(token))) { releaseResourceCollection(token); return; }
        await native.resourceSnapshot({ playlistId: token, begin: true, tracks: [], offset: 0, descriptor: collection });
        let offset = 0;
        for (; offset < known.length; offset += 50) {
            if ((own !== generation || !isResourceCollectionOwner(token))) return;
            await native.resourceSnapshot({
                playlistId: token, offset, tracks: known.slice(offset,offset+50).map(toNativeResourcePayload).filter(Boolean),
                finish: true, currentKey, total: collection.trackCount ?? known.length,
                catalogComplete: Boolean(collection.trackCount && known.length >= collection.trackCount),
            });
        }
        offset = known.length;
        while (own === generation && isResourceCollectionOwner(token) && policy.networkAllowed) {
            if (collection.trackCount && offset >= collection.trackCount) break;
            const page = await omni.getCollectionTracks(collection, { limit: 50, offset });
            if ((own !== generation || !isResourceCollectionOwner(token))) return;
            const items = page.items;
            if (!items.length) {
                await native.resourceSnapshot({playlistId:token,tracks:[],offset,finish:true,currentKey,catalogComplete:!page.hasMore});
                break;
            }
            items.forEach(song => keys.add(getPlaybackSongKey(song)));
            await native.resourceSnapshot({
                playlistId: token, offset, tracks: items.map(toNativeResourcePayload).filter(Boolean),
                finish: true, currentKey, total: page.total ?? collection.trackCount ?? offset + items.length, catalogComplete: !page.hasMore,
            });
            const next = page.nextOffset ?? offset + items.length;
            if (!page.hasMore || next <= offset) break;
            offset = next;
            Object.assign(policy, await native.resourceCache({}));
        }
        void import('./platformResourcePrecache').then(module => module.runPlatformResourcePrecache());
    } catch { activeToken = ''; /* Persisted pages survive catalog/network failures. */ }
    finally { catalogRunning = false; }
};

/** Resume missing catalog pages after Activity/process recreation, without reopening the playlist. */
export const resumeIncompleteCollectionResources = async (currentKey: string): Promise<void> => {
    if (!isCapacitorAndroid() || catalogRunning) return;
    const native=getTingyuPlayback<{
        resourceCache(o: object): Promise<{ descriptor?: LibraryCollectionDescriptor; playlistId: string; catalogOffset: number; metadataComplete: boolean; networkAllowed: boolean; containsCurrent: boolean }>;
        resourceSnapshot(o: object): Promise<void>;
    }>();
    try {
        const saved=await native.resourceCache({currentKey});
        if (!saved.containsCurrent || !saved.descriptor || saved.descriptor.source!=='online' || saved.metadataComplete || !saved.networkAllowed) return;
        catalogRunning=true;
        const own=++generation;
        const token=saved.playlistId;
        const keys=new Set([currentKey]);
        claimResourceCollection(token,keys,saved.descriptor);
        let offset=saved.catalogOffset;
        while(own===generation && isResourceCollectionOwner(token)) {
            const policy=await native.resourceCache({currentKey});
            if(!policy.networkAllowed)break;
            const page=await omni.getCollectionTracks(saved.descriptor,{limit:50,offset});
            if(own!==generation)break;
            if(!page.items.length){await native.resourceSnapshot({playlistId:token,tracks:[],offset,finish:true,currentKey,catalogComplete:!page.hasMore});break;}
            page.items.forEach(song=>keys.add(getPlaybackSongKey(song)));
            await native.resourceSnapshot({playlistId:token,offset,tracks:page.items.map(toNativeResourcePayload).filter(Boolean),finish:true,currentKey,total:page.total??saved.descriptor.trackCount,catalogComplete:!page.hasMore});
            const next=page.nextOffset??offset+page.items.length;
            if(!page.hasMore || next<=offset)break;
            offset=next;
        }
        void import('./platformResourcePrecache').then(module=>module.runPlatformResourcePrecache());
    } catch { /* Native cache jobs retain every already discovered resource. */ }
    finally { catalogRunning=false; }
};

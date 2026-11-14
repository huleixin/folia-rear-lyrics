import { getAudioCacheRoute } from './onlineMusic/resourceKeys';
import { syncLxScriptToNative } from './lxNativeScriptSync';
import type { LibraryCollectionDescriptor } from '../library/core/contracts/collection';
import type { SongResult } from '../types';
import type { AudioQualityPreference } from '../types/onlineMusic';
import { isCapacitorAndroid } from '../platform/runtime';
import { getTingyuPlayback } from '../platform/tingyuPlayback';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { setStatusMessage } from '../stores/useStatusMessageStore';
import { omni } from './onlineMusic/omni';
import { toNativeResourcePayload } from './nativePlaylistSync';

// src/services/audioPlaylistCache.ts
export interface AudioCacheStatus {
    enabled:boolean;paused?:boolean;wifiOnly:boolean;autoPlaylist:boolean;limitGb:number;bytes:number;cached:number;
    pending:number;running:number;complete:number;failed:number;cancelled:number;evicted:number;stale:number;taskLimitReached:boolean;networkAllowed:boolean;incompleteCatalogs:number;
    collections?:{id:string;name:string;total:number;complete:number;failed:number}[];
    tasks:{title:string;state:string;bytes:number;reason:string}[];
    catalogs:{id:string;descriptor:LibraryCollectionDescriptor;quality:AudioQualityPreference;offset:number;cacheRoute:string}[];
}
export const audioCacheRequest=(data:object={})=>getTingyuPlayback<{audioOffline(data:object):Promise<AudioCacheStatus>}>().audioOffline(data);
let resuming=false;
/** Discover every page through Omni. Native offsets and songs survive interruption; URLs do not persist. */
export async function resumeAudioPlaylistCatalogs():Promise<void>{
    if(!isCapacitorAndroid()||resuming)return;resuming=true;
    try{
        let status=await audioCacheRequest();
        if(status.paused||!status.networkAllowed)return;
        for(const saved of status.catalogs??[]){
            if(saved.descriptor.source!=='online'||saved.cacheRoute!==getAudioCacheRoute())continue;
            let offset=saved.offset;
            try{
                while(offset<10000){
                    status=await audioCacheRequest();
                    if(saved.cacheRoute!==getAudioCacheRoute()||status.paused||!status.networkAllowed||!status.catalogs?.some(x=>x.id===saved.id))break;
                    const page=await omni.getCollectionTracks(saved.descriptor,{offset,limit:50});
                    if(saved.cacheRoute!==getAudioCacheRoute())break;
                    const next=page.nextOffset??offset+page.items.length;
                    if(page.hasMore&&(!page.items.length||next<=offset))throw Error('Catalog did not advance');
                    await audioCacheRequest({action:'catalog',collection:saved.id,cacheRoute:saved.cacheRoute,quality:saved.quality,
                        tracks:page.items.map(toNativeResourcePayload).filter(Boolean),offset:next,done:!page.hasMore,failed:page.hasMore&&next>=10000});
                    if(!page.hasMore)break;offset=next;
                }
            }catch{await audioCacheRequest({action:'catalog',collection:saved.id,cacheRoute:saved.cacheRoute,failed:true});}
        }
    }catch{/* Saved songs remain available; resume is explicit after a catalog error. */}
    finally{resuming=false;}
}
export async function cacheAudioPlaylist(collection:LibraryCollectionDescriptor,known:readonly SongResult[],automatic=false):Promise<void>{
    if(!isCapacitorAndroid()||collection.source!=='online'||collection.type!=='playlist')return;
    try{
        const status=await audioCacheRequest();
        if(automatic&&!status.autoPlaylist)return;
        const quality=useAudioSettingsStore.getState().audioQuality;
        await syncLxScriptToNative();
        const route=getAudioCacheRoute();
        const id=collection.providerId+':'+collection.id+':'+quality+':'+route;
        await audioCacheRequest({action:'catalog',collection:id,cacheRoute:route,descriptor:collection,quality});
        // Known songs can be queued without a metadata request, but never advance the catalog offset.
        for(let i=0;i<known.length;i+=50){if(route!==getAudioCacheRoute())throw Error('Audio source changed');await audioCacheRequest({action:'enqueue',collection:id,cacheRoute:route,quality,tracks:known.slice(i,i+50).map(toNativeResourcePayload).filter(Boolean)});}
        if(route!==getAudioCacheRoute())throw Error('Audio source changed');
        if(!automatic){
            await audioCacheRequest({action:'resume'});
            if(known[0])void import('./collectionResourcePrecache').then(m=>m.precacheCollectionResources(collection,known,known[0],true));
        }
        if(!automatic)setStatusMessage({type:'success',text:'已加入缓存任务，可在存储设置查看进度',durationMs:3500});
        void resumeAudioPlaylistCatalogs();
    }catch{if(!automatic)setStatusMessage({type:'error',text:'未能加入缓存，请稍后重试',durationMs:3500});}
}

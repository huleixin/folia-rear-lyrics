import { useCallback, useEffect, useRef, useState } from 'react';
import { getTingyuPlayback } from '../../../platform/tingyuPlayback';
import { isCapacitorAndroid } from '../../../platform/runtime';

// src/components/modal/settings/useResourceCacheStatus.ts
export interface ResourceStatus {
    enabled:boolean;wifiOnly:boolean;lyricsBytes:number;artworkBytes:number;total:number;completed:number;
    failed:number;cachedSongs:number;pending:number;metadataComplete:boolean;discovered:number;
    confirmedLyrics?:number;provisionalLyrics?:number;noLyrics?:number;
    paused:boolean;networkAllowed:boolean;jobState:string;nextDue:number;platformPending:number;platformFailed?:number;lastError:string;
}
export function useResourceCacheStatus(){
    const [status,setStatus]=useState<ResourceStatus|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
    const epoch=useRef(0),mounted=useRef(false),mutating=useRef(false);
    const update=useCallback(async(action?:string,next?:Partial<ResourceStatus>)=>{
        if(mutating.current)return;
        const own=++epoch.current;if(action){mutating.current=true;setBusy(true);}
        try{const value=await getTingyuPlayback<{resourceCache(o:object):Promise<ResourceStatus>}>().resourceCache({action,...next});
            if(mounted.current&&own===epoch.current){setStatus(value);setError('');}
            if(action==='resume'||action==='retry'){
                void import('../../../services/platformResourcePrecache').then(m=>m.runPlatformResourcePrecache());
                const {usePlaybackStore}=await import('../../../stores/usePlaybackStore');const song=usePlaybackStore.getState().currentSong;
                if(song){const {getPlaybackSongKey}=await import('../../../utils/appPlaybackGuards');void import('../../../services/collectionResourcePrecache').then(m=>m.resumeIncompleteCollectionResources(getPlaybackSongKey(song)));}
            }}
        catch{if(mounted.current&&own===epoch.current)setError('状态读取失败，请重试');}
        finally{if(action){mutating.current=false;if(mounted.current)setBusy(false);}}
    },[]);
    useEffect(()=>{
        if(!isCapacitorAndroid())return;mounted.current=true;let timer:ReturnType<typeof setTimeout>|undefined,visibilityEpoch=0;
        const tick=async()=>{const ticket=visibilityEpoch;if(document.visibilityState!=='visible')return;await update();if(mounted.current&&visibilityEpoch===ticket&&document.visibilityState==='visible')timer=setTimeout(tick,4000);};
        const visibility=()=>{clearTimeout(timer);visibilityEpoch++;epoch.current++;if(document.visibilityState==='visible')void tick();};
        document.addEventListener('visibilitychange',visibility);void tick();
        return()=>{mounted.current=false;epoch.current++;clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
    },[update]);
    return {status,busy,error,update};
}

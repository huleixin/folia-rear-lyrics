import {useCallback,useEffect,useRef,useState} from 'react';
import {isCapacitorAndroid} from '../../../platform/runtime';
import {audioCacheRequest,resumeAudioPlaylistCatalogs,type AudioCacheStatus} from '../../../services/audioPlaylistCache';

// src/components/modal/settings/useAudioCacheStatus.ts
export function useAudioCacheStatus(){
    const [status,setStatus]=useState<AudioCacheStatus|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false);
    const usage=useRef('');
    const epoch=useRef(0),mounted=useRef(false),mutating=useRef(false);
    const update=useCallback(async(action?:string,next:object={})=>{
        if(mutating.current)return;const own=++epoch.current;
        if(action){mutating.current=true;setBusy(true);}
        try{const value=await audioCacheRequest({action,...next});if(mounted.current&&own===epoch.current){setStatus(value);setError(false);
                const nextUsage=value.bytes+':'+value.cached;
                if(usage.current&&usage.current!==nextUsage)window.dispatchEvent(new Event('tingyu-offline-cache-usage'));
                usage.current=nextUsage;}
            if(action==='retry'||action==='configure')void resumeAudioPlaylistCatalogs();
        }catch{if(mounted.current&&own===epoch.current)setError(true);}
        finally{if(action){mutating.current=false;if(mounted.current)setBusy(false);}}
    },[]);
    useEffect(()=>{
        if(!isCapacitorAndroid())return;mounted.current=true;let timer:ReturnType<typeof setTimeout>|undefined,ticket=0;
        const tick=async()=>{const own=ticket;if(document.visibilityState!=='visible')return;await update();void resumeAudioPlaylistCatalogs();if(mounted.current&&own===ticket&&document.visibilityState==='visible')timer=setTimeout(tick,4000);};
        const visibility=()=>{clearTimeout(timer);ticket++;epoch.current++;if(document.visibilityState==='visible')void tick();};
        document.addEventListener('visibilitychange',visibility);void tick();
        return()=>{mounted.current=false;ticket++;epoch.current++;clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
    },[update]);
    return {status,busy,error,update};
}

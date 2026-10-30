import { useEffect, useRef, type RefObject } from 'react';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { useLxSourceStore } from '../stores/useLxSourceStore';
import { getPlaybackSongKey, isLocalPlaybackSong, isNavidromePlaybackSong } from '../utils/appPlaybackGuards';
import { getPrefetchedData, resolvePrefetchAudioUrl, updatePrefetchedAudioUrl } from '../services/prefetchService';
import { nativeAudioUrlForRef } from '../services/nativeLocalMusic';
import { buildNativePlaybackPayload } from '../services/nativePlaybackBridge';
import { setNativeAudioQueue } from '../services/nativeAudioElement';
import { shufflePlayback } from '../services/shufflePlayback';
import { hasBeforePlayHook } from '../services/hostExtensionHooks';
import type { LocalSong, SongResult } from '../types';
import type { PlaybackNavigationOptions } from '../types/appPlayback';
import type { NativeAudioState, NativeQueueTrack } from '../types/nativeAudio';

// src/hooks/useNativeQueuedPlayback.ts
// Pre-resolve a bounded online window (all remaining local URIs). The native playlist
// owns auto-advance; React only reconciles metadata/lyrics after that advance.
//
// Long-session background reliability rules (media3 online playback used to stop after a
// few tracks with the screen off; none of these keep the WebView awake or poll while healthy):
// - The window only bounds *lookahead*, not total playback: every native auto-advance
//   reconciles back through JS, which re-runs this effect and re-resolves the window.
// - One unresolvable candidate (rate limit, taken-down track, expired URL) must not strand
//   the whole native queue: skip it for queueing and keep queueing later candidates. The
//   canonical JS queue still owns the order - the skipped track is retried by the 'ended'
//   path when its turn comes, it just loses its prefetch head start.
// - A hanging provider request must not freeze replenishment: resolution races a timeout.
// - When a transient failure leaves the window empty, a bounded low-frequency retry heals
//   it instead of waiting for the next track change that may never come while the queue drains.
const ONLINE_QUEUE_WINDOW=5,MAX_UNRESOLVED_SKIPS=3,RESOLVE_TIMEOUT_MS=15_000,
    REPLENISH_RETRY_MS=30_000,REPLENISH_RETRY_LIMIT=3;
/** Resolves with null when the underlying promise neither settles within `ms`. */
const raceTimeout=async<T>(value:Promise<T>,ms:number):Promise<T|null>=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([value,new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),ms)})]);}
    finally{if(timer!==undefined)clearTimeout(timer);}
};
export function useNativeQueuedPlayback(audio:RefObject<HTMLAudioElement|null>,enabled:boolean,localSongs:LocalSong[],
    play:(song:SongResult,queue:SongResult[],fm:boolean,options:PlaybackNavigationOptions)=>Promise<void>){
    const song=usePlaybackStore(s=>s.currentSong),queue=usePlaybackStore(s=>s.playQueue),source=usePlaybackStore(s=>s.audioSrc);
    const context=usePlaybackStore(s=>s.activePlaybackContext),fm=usePlaybackStore(s=>s.isFmMode);
    const quality=useAudioSettingsStore(s=>s.audioQuality),loop=useAudioSettingsStore(s=>s.loopMode),shuffle=useAudioSettingsStore(s=>s.shuffleEnabled);
    const lx=useLxSourceStore(s=>s.activeId);
    const latest=useRef({play,queue,fm});latest.current={play,queue,fm};
    useEffect(()=>{
        if(!enabled)return;
        const transition=(event:Event)=>{
            const state=(event as CustomEvent<NativeAudioState>).detail;
            const current=latest.current,track=current.queue.find(s=>getPlaybackSongKey(s)===state.songKey);
            if(!track||!state.uri)return;
            void current.play(track,current.queue,current.fm,{shouldNavigateToPlayer:false,
                nativeHandoff:{uri:state.uri,position:state.position,playing:!state.paused}});
        };
        window.addEventListener('tingyu-native-queue-track',transition);
        return()=>window.removeEventListener('tingyu-native-queue-track',transition);
    },[enabled]);
    useEffect(()=>{
        const element=audio.current;
        if(!enabled||!element||!song||!source||context!=='main')return;
        const abort=new AbortController(),key=getPlaybackSongKey(song);
        const valid=()=>!abort.signal.aborted&&usePlaybackStore.getState().currentSong!=null&&
            getPlaybackSongKey(usePlaybackStore.getState().currentSong!)===key;
        const send=async(tracks:NativeQueueTrack[])=>{if(valid())await setNativeAudioQueue(element,tracks.slice());};
        let retryTimer:ReturnType<typeof setTimeout>|null=null,retries=0;
        // Reads live store state so a retry heals against the queue as it is *now*, not as it
        // was when the effect ran. Returns the resolved tracks; callers decide what to send.
        const resolveWindow=async()=>{
            const tracks:NativeQueueTrack[]=[];
            const state=usePlaybackStore.getState(),liveSong=state.currentSong;
            if(!liveSong)return tracks;
            const liveQueue=state.playQueue,index=liveQueue.findIndex(s=>getPlaybackSongKey(s)===key);
            if(index<0)return tracks;
            const shuffled=shufflePlayback.active()?shufflePlayback.next(liveQueue,liveSong):null;
            let candidates=shuffled?[shuffled]:liveQueue.slice(index+1);
            if(!candidates.length&&loop==='all')candidates=liveQueue.slice();
            const localOnly=candidates.length>0&&candidates.every(isLocalPlaybackSong);
            candidates=candidates.slice(0,localOnly?999:ONLINE_QUEUE_WINDOW);
            let skips=0;
            for(const next of candidates){
                if(!valid())return tracks;
                let uri:string|null=null;
                if(isLocalPlaybackSong(next)){
                    const record=localSongs.find(s=>s.id===next.localRef.songId);
                    uri=record?.nativeAudioRef?await nativeAudioUrlForRef(record.nativeAudioRef):record?.nativeAudioUrl??null;
                }else if(!isNavidromePlaybackSong(next)){
                    const existing=getPrefetchedData(next,quality);
                    const resolved=existing?.audioUrl&&existing.audioUrl!=='CACHED_IN_DB'?{audioUrl:existing.audioUrl,replayGain:existing.replayGain}:
                        await raceTimeout(resolvePrefetchAudioUrl(next,quality,abort.signal),RESOLVE_TIMEOUT_MS);
                    uri=resolved?.audioUrl??null;
                    if(uri&&uri!=='CACHED_IN_DB')updatePrefetchedAudioUrl(next,uri,quality,resolved?.replayGain);
                }
                if(!valid())return tracks;
                // Never switch an unresolved track's source/quality, and never let it strand
                // the queue: skip it for queueing only, bounded so a fully failing provider
                // cannot spin the window.
                if(!uri||! /^(https?:|content:|file:)/.test(uri)){
                    if(++skips>=MAX_UNRESOLVED_SKIPS)break;
                    continue;
                }
                const metadata=buildNativePlaybackPayload(next,true,0,(next.durationMs??0)/1000);
                tracks.push({songKey:getPlaybackSongKey(next),uri,title:metadata.title,artist:metadata.artist,album:metadata.album,coverUrl:metadata.coverUrl,duration:metadata.duration});
                // First next-track URI is usable immediately, without waiting on later sources.
                if(!localOnly)await send(tracks);
            }
            return tracks;
        };
        void (async()=>{
            // Extension hooks must retain their ability to cancel a track before it sounds.
            if(loop==='one'||hasBeforePlayHook()){await send([]);return;}
            const tracks=await resolveWindow();
            await send(tracks);
            while(tracks.length===0&&!abort.signal.aborted&&retries<REPLENISH_RETRY_LIMIT){
                await new Promise<void>(resolve=>{retryTimer=setTimeout(resolve,REPLENISH_RETRY_MS);});
                if(!valid())return;
                retries++;
                const retried=await resolveWindow();
                await send(retried);
                if(retried.length>0)break;
            }
        })().catch(error=>{if(valid())console.warn('[NativeQueue] Preload failed; foreground retry remains available',error)});
        return()=>{abort.abort();if(retryTimer!==null)clearTimeout(retryTimer);};
    },[enabled,audio,song,queue,source,context,quality,loop,shuffle,lx,localSongs]);
}

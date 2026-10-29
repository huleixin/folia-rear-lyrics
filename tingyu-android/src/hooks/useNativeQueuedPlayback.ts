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
        const tracks:NativeQueueTrack[]=[];
        const valid=()=>!abort.signal.aborted&&usePlaybackStore.getState().currentSong!=null&&
            getPlaybackSongKey(usePlaybackStore.getState().currentSong!)===key;
        const send=()=>valid()?setNativeAudioQueue(element,tracks.slice()):undefined;
        void (async()=>{
            // Extension hooks must retain their ability to cancel a track before it sounds.
            if(loop==='one'||hasBeforePlayHook()){await send();return;}
            const index=queue.findIndex(s=>getPlaybackSongKey(s)===key);
            if(index<0){await send();return;}
            const shuffled=shufflePlayback.active()?shufflePlayback.next(queue,song):null;
            let candidates=shuffled?[shuffled]:queue.slice(index+1);
            if(!candidates.length&&loop==='all')candidates=queue.slice();
            const localOnly=candidates.length>0&&candidates.every(isLocalPlaybackSong);
            candidates=candidates.slice(0,localOnly?999:3);
            for(const next of candidates){
                if(!valid())return;
                let uri:string|null=null;
                if(isLocalPlaybackSong(next)){
                    const record=localSongs.find(s=>s.id===next.localRef.songId);
                    uri=record?.nativeAudioRef?await nativeAudioUrlForRef(record.nativeAudioRef):record?.nativeAudioUrl??null;
                }else if(!isNavidromePlaybackSong(next)){
                    const existing=getPrefetchedData(next,quality);
                    const resolved=existing?.audioUrl&&existing.audioUrl!=='CACHED_IN_DB'?{audioUrl:existing.audioUrl,replayGain:existing.replayGain}:
                        await resolvePrefetchAudioUrl(next,quality,abort.signal);
                    uri=resolved?.audioUrl??null;
                    if(uri&&uri!=='CACHED_IN_DB')updatePrefetchedAudioUrl(next,uri,quality,resolved?.replayGain);
                }
                if(!valid())return;
                // Never silently skip an unresolved track or switch its source/quality.
                if(!uri||! /^(https?:|content:|file:)/.test(uri))break;
                const metadata=buildNativePlaybackPayload(next,true,0,(next.durationMs??0)/1000);
                tracks.push({songKey:getPlaybackSongKey(next),uri,title:metadata.title,artist:metadata.artist,album:metadata.album,coverUrl:metadata.coverUrl,duration:metadata.duration});
                // First next-track URI is usable immediately, without waiting on later sources.
                if(!localOnly)await send();
            }
            await send();
        })().catch(error=>{if(valid())console.warn('[NativeQueue] Preload failed; foreground retry remains available',error)});
        return()=>abort.abort();
    },[enabled,audio,song,queue,source,context,quality,loop,shuffle,lx,localSongs]);
}

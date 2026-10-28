import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { registerPlugin } from '@capacitor/core';
import { attachNativeAudioElement } from '../services/nativeAudioElement';
import type { NativeAudioPort } from '../types/nativeAudio';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { useAutomixSettingsStore } from '../stores/useAutomixSettingsStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { useAppViewStore } from '../stores/useAppViewStore';
import { useRearRuntimeStore } from '../stores/useRearRuntimeStore';
import { useMainStageActive } from './useStageActivity';
import { isAndroidNativeRuntime } from '../utils/platform';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { setStatusMessage } from '../stores/useStatusMessageStore';
import { PlayerState } from '../types';

// src/hooks/useNativeAudioDeck.ts
const native=registerPlugin<NativeAudioPort>('TingyuPlayback');
export const nativeAudioUri=(source:string|null)=>!source||/^(https?:|content:|file:)/.test(source);
export function useNativeAudioDeck(audioRef:RefObject<HTMLAudioElement|null>,activeDeck:string){
    const android=isAndroidNativeRuntime(),[supported,setSupported]=useState<boolean|null>(android?null:false);
    const adapter=useRef<ReturnType<typeof attachNativeAudioElement>|null>(null);
    const source=usePlaybackStore(state=>state.audioSrc),song=usePlaybackStore(state=>state.currentSong);
    const gain=usePlaybackStore(state=>state.replayGainMode),playing=usePlaybackStore(state=>state.playerState===PlayerState.PLAYING);
    const effects=useAudioSettingsStore(state=>state.audioEqualizerSettings.enabled),fade=useAudioSettingsStore(state=>state.playbackFadeEnabled);
    const loop=useAudioSettingsStore(state=>state.loopMode),mixing=useAutomixSettingsStore(state=>state.automixEnabled);
    const main=useMainStageActive(),view=useAppViewStore(state=>state.view),rear=useRearRuntimeStore(state=>state.enabled&&!state.sleeping);
    // MediaElementAudioSource cannot be attached a second time. Once advanced DSP is requested,
    // keep its existing compatible pipeline for this session rather than repeatedly swapping it.
    const compatibility=useRef(!nativeAudioUri(source)||effects||mixing||gain!=='off');
    if(!nativeAudioUri(source)||effects||mixing||gain!=='off')compatibility.current=true;
    const own=android&&supported!==false&&!compatibility.current;
    const songKey=song?getPlaybackSongKey(song):'';
    const analysis=playing&&((main&&view==='player')||rear);
    useEffect(()=>{if(!android)return;let disposed=false;
        void native.probe().then(value=>{if(!disposed)setSupported(value.supported===true)}).catch(()=>{if(!disposed)setSupported(false)});
        return()=>{disposed=true};
    },[android]);
    useLayoutEffect(()=>{
        if(!own||supported!==true)return;
        const element=audioRef.current;if(!element)return;
        const value=attachNativeAudioElement(element,native);adapter.current=value;
        return()=>{
            const snapshot=value.snapshot();adapter.current=null;
            // Hold transport ownership until native output has stopped; do not sound both engines.
            if(audioRef.current===element)audioRef.current=null;
            void value.dispose().then(()=>{
                if(!element.isConnected)return;
                audioRef.current=element;
                const state=usePlaybackStore.getState(),same=snapshot.source===state.audioSrc;
                if(state.audioSrc){
                    element.src=state.audioSrc;
                    const handoffSource=state.audioSrc;
                    element.addEventListener('loadedmetadata',()=>{
                        const current=usePlaybackStore.getState();
                        if(current.audioSrc!==handoffSource||audioRef.current!==element)return;
                        if(same&&snapshot.position>0)element.currentTime=snapshot.position;
                        if(current.playerState===PlayerState.PLAYING)void element.play().catch(()=>{});
                    },{once:true});element.load();
                }
            }).catch(()=>{if(element.isConnected)setStatusMessage({type:'error',text:'播放引擎切换未完成，请重新打开听屿后重试'});});
        };
    },[own,supported,activeDeck,audioRef]);
    useLayoutEffect(()=>{adapter.current?.configure({fade,analysis,loop:loop==='one'});},[fade,analysis,loop,own,supported]);
    useLayoutEffect(()=>{adapter.current?.setSource(source??'',songKey);},[source,songKey,own,supported]);
    return { suppressBrowserSource:own };
}

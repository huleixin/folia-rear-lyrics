import React, { useEffect, useRef, useState } from 'react';
import { usePlaybackAudioBridge } from '../../src/hooks/usePlaybackAudioBridge';
import { useAutomixDecks } from '../../src/services/automix/useAutomixDecks';
import { DEFAULT_TRANSITION_SETTINGS } from '../../src/services/automix/transitionStrategy';
import { usePlaybackStore, setPlayerState } from '../../src/stores/usePlaybackStore';
import { useAppViewStore } from '../../src/stores/useAppViewStore';
import { setRearRuntime } from '../../src/stores/useRearRuntimeStore';
import { useAudioSettingsStore } from '../../src/stores/useAudioSettingsStore';
import { resolveAudioEqualizerSettings } from '../../src/utils/audioEqualizer';
import { PlayerState } from '../../src/types';
import type { ProbeDefinition } from './definition';

// dev/probes/ordinaryPlaybackPower.probe.tsx
// Real HTMLAudioElement, live AudioContext, actual deck/audio hooks and native visibility policy.
export const makeTone = () => {
    const rate=44100, count=rate*8, bytes=new ArrayBuffer(44+count*2), view=new DataView(bytes);
    const text=(at:number,value:string)=>[...value].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
    text(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');
    view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
    view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
    text(36,'data');view.setUint32(40,count*2,true);
    for(let i=0;i<count;i++)view.setInt16(44+i*2,Math.sin(i*2*Math.PI*440/rate)*4000,true);
    return URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
};
const tone = makeTone();
const noop = () => undefined;
function OrdinaryPlaybackPower() {
    const audioRef=useRef<HTMLAudioElement|null>(null),context=useRef<AudioContext|null>(null),analyser=useRef<AnalyserNode|null>(null);
    const gain=useRef<GainNode|null>(null),key=useRef<string|number|null>('power-fixture'),auto=useRef(false);
    const [mixing,setMixing]=useState(false),[failure,setFailure]=useState('');
    const decks=useAutomixDecks({audioRef,audioContextRef:context,currentSongKeyRef:key,coverUrl:null,loopMode:'off',
        isEnabled:mixing,transition:DEFAULT_TRANSITION_SETTINGS,onAdvanceTrack:noop});
    const bridge=usePlaybackAudioBridge({audioRef,audioContextRef:context,analyserRef:analyser,gainNodeRef:gain,
        localSongs:[],isLyricsLoading:false,shouldAutoPlayRef:auto,connectDecks:decks.connectDecks,getActiveChain:decks.getActiveChain,
        suppressAutoplayRef:decks.suppressAutoplayRef,isAutoplayHeld:decks.autoplayHeld,
        syncOutputGain:()=>{if(gain.current)gain.current.gain.value=.5;},getTargetPlaybackVolume:()=>.5,
        getCoverUrl:()=>null,updateCacheSize:noop});
    useEffect(()=>{
        useAppViewStore.setState({view:'home'});setRearRuntime(false,false);
        useAudioSettingsStore.setState({audioEqualizerSettings:resolveAudioEqualizerSettings({enabled:false})});
        usePlaybackStore.setState({audioSrc:tone,currentSong:{id:'power-fixture',name:'Power QA',artists:[],album:{id:1,name:''},durationMs:8000},
            playerState:PlayerState.PAUSED,playQueue:[],lyrics:null});
    },[]);
    const play=async()=>{try{bridge.setupAudioAnalyzer();await context.current?.resume();await audioRef.current?.play();setPlayerState(PlayerState.PLAYING);}catch(error){setFailure(String(error));}};
    useEffect(()=>{
        (window as unknown as {__ordinaryPlaybackProbe:unknown}).__ordinaryPlaybackProbe={
            read:()=>({time:audioRef.current?.currentTime,paused:audioRef.current?.paused,context:context.current?.state,
                playing:usePlaybackStore.getState().playerState,mixing,view:useAppViewStore.getState().view,
                gain:gain.current?.gain.value}),
        };
    },[mixing]);
    return <main style={{padding:24}}><h1>Ordinary playback lifecycle QA</h1>
        <audio ref={decks.registerDeckA} src={decks.deckSrc('A')} loop /><audio ref={decks.registerDeckB} src={decks.deckSrc('B')} loop />
        <button onClick={()=>void play()}>Play</button>
        <button onClick={()=>{audioRef.current?.pause();setPlayerState(PlayerState.PAUSED);}}>Pause</button>
        <button onClick={()=>useAppViewStore.setState({view:'home'})}>Library</button>
        <button onClick={()=>useAppViewStore.setState({view:'player'})}>Stage</button>
        <button onClick={()=>setMixing(value=>!value)}>Toggle mixing</button>
        <button onClick={()=>setRearRuntime(true,false)}>Rear awake</button>
        <button onClick={()=>setRearRuntime(false,false)}>Rear off</button>
        <output>{failure}</output>
    </main>;
}
export default {id:'ordinaryPlaybackPower',title:'Ordinary playback power',description:'Real playback hooks; no network, GPU stage or native device needed.',Component:OrdinaryPlaybackPower} satisfies ProbeDefinition;

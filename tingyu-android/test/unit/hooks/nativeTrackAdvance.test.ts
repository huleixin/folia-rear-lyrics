// @vitest-environment jsdom
import { act, createElement as h, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useNativeAudioDeck } from '@/hooks/useNativeAudioDeck';
import { usePlaybackAudioBridge } from '@/hooks/usePlaybackAudioBridge';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useAudioSettingsStore } from '@/stores/useAudioSettingsStore';
import { useAutomixSettingsStore } from '@/stores/useAutomixSettingsStore';
import { PlayerState } from '@/types';

// test/unit/hooks/nativeTrackAdvance.test.ts
const port=vi.hoisted(()=>({probe:vi.fn(async()=>({supported:true,engine:'test'})),command:vi.fn(async(_:any)=>({accepted:true})),addListener:vi.fn(async(_:any,cb:any)=>({remove:async()=>{}}))}));
vi.mock('@capacitor/core',()=>({registerPlugin:()=>port}));
vi.mock('@/utils/playbackEngineTestBuild',()=>({PLAYBACK_TEST_BUILD:false,PLAYBACK_TEST_SESSION_ENGINE:'media3'}));
vi.mock('@/utils/platform',()=>({isAndroidNativeRuntime:()=>true}));
vi.mock('@/hooks/useStageActivity',()=>({useMainStageActive:()=>false}));
vi.mock('react-i18next',async original=>({...await original<any>(),useTranslation:()=>({t:(s:string)=>s})}));
it('autoplays three consecutive native sources without a legacy pause consuming the next-track intent',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    const playback=usePlaybackStore.getState(),settings=useAudioSettingsStore.getState(),mix=useAutomixSettingsStore.getState();
    useAudioSettingsStore.setState({audioEqualizerSettings:{...settings.audioEqualizerSettings,enabled:false},playbackFadeEnabled:false});
    useAutomixSettingsStore.setState({automixEnabled:false});usePlaybackStore.setState({replayGainMode:'off',audioSrc:null});
    const intent={current:true};let element:HTMLAudioElement|null=null;
    const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
    const noop=()=>{},elements=()=>[],target=()=>1;
    function Probe(){const ref=useRef<HTMLAudioElement>(null),deck=useNativeAudioDeck(ref,'A');
        const context=useRef<AudioContext|null>(null),analyser=useRef<AnalyserNode|null>(null),gain=useRef<GainNode|null>(null),suppress=useRef(false);
        usePlaybackAudioBridge({audioRef:ref,localSongs:[],isLyricsLoading:false,shouldAutoPlayRef:intent,audioContextRef:context,analyserRef:analyser,gainNodeRef:gain,
            connectDecks:()=>false,getActiveChain:()=>null,getAudioElements:elements,suppressAutoplayRef:suppress,isAutoplayHeld:false,
            syncOutputGain:noop,getTargetPlaybackVolume:target,getCoverUrl:()=>null,updateCacheSize:noop});
        const source=usePlaybackStore(s=>s.audioSrc);
        return h('audio',{ref:(node:HTMLAudioElement|null)=>{ref.current=node;element=node;},src:deck.suppressBrowserSource?undefined:source??undefined,
            onPause:()=>{intent.current=false;}});
    }
    try{
        await act(async()=>root.render(h(Probe)));
        for(let n=1;n<=3;n++){
            intent.current=true;
            await act(async()=>{
                usePlaybackStore.setState({audioSrc:`https://test.example/${n}.mp3`,playerState:PlayerState.IDLE});
            });
            const prepare=port.command.mock.calls.filter(([c])=>c.action==='prepare').at(-1)![0];
            expect(prepare.uri).toBe(`https://test.example/${n}.mp3`);
            const play=port.command.mock.calls.filter(([c])=>c.action==='play').at(-1)![0];
            expect(play.id).toBe(prepare.id);
            const cb=port.addListener.mock.calls.at(-1)![1];
            await act(async()=>cb({id:play.id,sequence:play.sequence,type:'state',position:0,duration:200,buffered:20,playing:true,paused:false,status:3}));
            expect(element!.paused).toBe(false);
        }
        expect(port.command.mock.calls.filter(([c])=>c.action==='pause')).toHaveLength(0);
        expect(port.command.mock.calls.filter(([c])=>c.action==='play')).toHaveLength(3);
    }finally{await act(async()=>root.unmount());host.remove();usePlaybackStore.setState(playback);useAudioSettingsStore.setState(settings);useAutomixSettingsStore.setState(mix);}
});

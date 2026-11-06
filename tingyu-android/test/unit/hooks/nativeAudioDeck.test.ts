// @vitest-environment jsdom
import { act, createElement as h, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useNativeAudioDeck } from '@/hooks/useNativeAudioDeck';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useAudioSettingsStore } from '@/stores/useAudioSettingsStore';
import { useAutomixSettingsStore } from '@/stores/useAutomixSettingsStore';
import { useAppViewStore } from '@/stores/useAppViewStore';
import { useRearRuntimeStore } from '@/stores/useRearRuntimeStore';
import { PlayerState, type SongResult } from '@/types';
import { armRecoveryPosition, armRecoveryPresentation, consumeRecoveryPresentation } from '@/services/androidSessionRecovery';
import { markNativeQueueAdoption } from '@/services/nativeAudioElement';
import { getPlaybackSongKey } from '@/utils/appPlaybackGuards';
import { usePlaybackEngineTestStore } from '@/stores/usePlaybackEngineTestStore';

// test/unit/hooks/nativeAudioDeck.test.ts
const { port } = vi.hoisted(() => ({ port: {
    compatiblePlayback:vi.fn(async()=>({accepted:true})),
    probe: vi.fn(async () => ({ supported: true, engine: 'test' })),
    command: vi.fn(async (_value: Record<string, unknown>) => ({ accepted: true })),
    addListener: vi.fn(async () => ({ remove: async () => {} })),
} }));
vi.mock('@/utils/playbackEngineTestBuild', () => ({ PLAYBACK_TEST_BUILD: true, PLAYBACK_TEST_SESSION_ENGINE: 'media3' }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => port }));
vi.mock('@/utils/platform', () => ({ isAndroidNativeRuntime: () => true }));
vi.mock('@/hooks/useStageActivity', () => ({ useMainStageActive: () => true }));
it('gives native playback exclusive ownership and enables analysis only for an awake displayed stage', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const playback=usePlaybackStore.getState(), audio=useAudioSettingsStore.getState(), mix=useAutomixSettingsStore.getState(), view=useAppViewStore.getState(), rear=useRearRuntimeStore.getState();
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
    function Probe(){const ref=useRef<HTMLAudioElement>(null), deck=useNativeAudioDeck(ref,'A');return h('audio',{ref,src:deck.suppressBrowserSource?undefined:'https://audio.example/test.mp3'});}
    usePlaybackStore.setState({audioSrc:'https://audio.example/test.mp3',currentSong:null,replayGainMode:'off',playerState:PlayerState.PLAYING});
    useAudioSettingsStore.setState({audioEqualizerSettings:{...audio.audioEqualizerSettings,enabled:false}});
    useAutomixSettingsStore.setState({automixEnabled:false});useAppViewStore.setState({view:'home'});useRearRuntimeStore.setState({enabled:false,sleeping:true});
    try {
        await act(async()=>root.render(h(Probe)));
        expect(host.querySelector('audio')!.hasAttribute('src')).toBe(false);
        expect(port.command.mock.calls.filter(([c])=>c.action==='prepare')).toHaveLength(1);
        const analysis=()=>port.command.mock.calls.filter(([c])=>c.action==='configure'||c.action==='prepare').at(-1)![0].analysis;
        expect(analysis()).toBe(false);
        const transportBefore=port.command.mock.calls.filter(([c])=>['prepare','play','pause','detach','seek'].includes(String(c.action))).length;
        for(let i=0;i<8;i++){
            await act(async()=>useAppViewStore.setState({view:'player'}));expect(analysis()).toBe(true);
            await act(async()=>useAppViewStore.setState({view:'home'}));expect(analysis()).toBe(false);
        }
        const configurations=port.command.mock.calls.filter(([c])=>c.action==='configure'||c.action==='prepare');
        expect(configurations.every(([c])=>c.interactive===true)).toBe(true);
        expect(port.command.mock.calls.filter(([c])=>['prepare','play','pause','detach','seek'].includes(String(c.action)))).toHaveLength(transportBefore);
        await act(async()=>useRearRuntimeStore.setState({enabled:true,sleeping:false}));expect(analysis()).toBe(true);
        await act(async()=>useRearRuntimeStore.setState({sleeping:true}));expect(analysis()).toBe(false);
        expect(port.command.mock.calls.filter(([c])=>c.action==='prepare')).toHaveLength(1);
    } finally {
        await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();usePlaybackStore.setState(playback);useAudioSettingsStore.setState(audio);useAutomixSettingsStore.setState(mix);useAppViewStore.setState(view);useRearRuntimeStore.setState(rear);
    }
});

it('retries Media3 across 50 attempts, repeated identities and decoder fallbacks; network errors never change capability',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    const saved=usePlaybackStore.getState(),audio=useAudioSettingsStore.getState(),mix=useAutomixSettingsStore.getState();
    const load=vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{}),pause=vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
    let listener!:(value:any)=>void;
    port.addListener.mockImplementation(async(...args:any[])=>{listener=args[1];return {remove:async()=>{}};});
    port.command.mockClear();const generation={current:0};
    const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
    function Probe(){const ref=useRef<HTMLAudioElement>(null),deck=useNativeAudioDeck(ref,'A',generation);return h('audio',{ref,src:deck.suppressBrowserSource?undefined:usePlaybackStore.getState().audioSrc??undefined});}
    useAudioSettingsStore.setState({audioEqualizerSettings:{...audio.audioEqualizerSettings,enabled:false}});useAutomixSettingsStore.setState({automixEnabled:false});
    usePlaybackStore.setState({audioSrc:null,currentSong:null,playerState:PlayerState.PAUSED,replayGainMode:'off'});
    const settle=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});};
    const prepares=()=>port.command.mock.calls.filter(([c])=>c.action==='prepare');
    try{
        await act(async()=>root.render(h(Probe)));
        for(let i=0;i<50;i++){
            const song:SongResult={id:i%5,name:'Same title',durationMs:200000,artists:[],album:{id:1,name:''},sourceRef:{kind:'online',providerId:i%2?'qq':'netease',mediaId:String(i%5)}};
            generation.current++;
            await act(async()=>usePlaybackStore.setState({currentSong:song,audioSrc:'https://audio.test/'+(i%5),playerState:PlayerState.PAUSED}));await settle();
            const prepared=prepares().at(-1)![0];expect(prepared.songKey).toBe(getPlaybackSongKey(song));expect(usePlaybackEngineTestStore.getState().actual).toBe('media3');
            const event={id:prepared.id,sequence:prepared.sequence,type:'state',status:1,position:0,duration:200,buffered:0,paused:true,playing:false};
            if(i%2){await act(async()=>listener({...event,errorCode:4005}));await settle();expect(usePlaybackEngineTestStore.getState()).toMatchObject({actual:'web',reason:'track-decoder-fallback'});}
            else{const detach=port.command.mock.calls.filter(([c])=>c.action==='detach').length;await act(async()=>listener({...event,errorCode:2002}));await settle();expect(port.command.mock.calls.filter(([c])=>c.action==='detach')).toHaveLength(detach);}
        }
        generation.current++;await act(async()=>usePlaybackStore.setState({audioSrc:'https://audio.test/last'}));await settle();
        await act(async()=>useAudioSettingsStore.setState({audioEqualizerSettings:{...audio.audioEqualizerSettings,enabled:true}}));await settle();
        expect(usePlaybackEngineTestStore.getState()).toMatchObject({actual:'web',reason:'effects'});
        await act(async()=>useAudioSettingsStore.setState({audioEqualizerSettings:{...audio.audioEqualizerSettings,enabled:false}}));await settle();
        expect(usePlaybackEngineTestStore.getState().actual).toBe('media3');
        await act(async()=>useAutomixSettingsStore.setState({automixEnabled:true}));await settle();
        expect(usePlaybackEngineTestStore.getState()).toMatchObject({actual:'web',reason:'automix'});
        await act(async()=>useAutomixSettingsStore.setState({automixEnabled:false}));await settle();
        expect(usePlaybackEngineTestStore.getState().actual).toBe('media3');
        await act(async()=>usePlaybackStore.setState({replayGainMode:'track'}));await settle();
        expect(usePlaybackEngineTestStore.getState()).toMatchObject({actual:'web',reason:'replaygain'});
        await act(async()=>usePlaybackStore.setState({replayGainMode:'off'}));await settle();
        expect(usePlaybackEngineTestStore.getState().actual).toBe('media3');
    }finally{await act(async()=>root.unmount());host.remove();load.mockRestore();pause.mockRestore();usePlaybackStore.setState(saved);useAudioSettingsStore.setState(audio);useAutomixSettingsStore.setState(mix);}
});

it.each(['cold','live'])('%s recovery sends a single prepare with the existing safe ownership contract',async(kind)=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;port.command.mockClear();
    const old=usePlaybackStore.getState(),settings=useAudioSettingsStore.getState(),mix=useAutomixSettingsStore.getState();
    const song:SongResult={id:38,name:'Recovered',artists:[],album:{id:1,name:'A'},durationMs:300000,sourceRef:{kind:'online',providerId:'qq',mediaId:'38'}};
    const key=getPlaybackSongKey(song),consumed=vi.fn();
    if(kind==='cold')armRecoveryPosition(key,123456,consumed);else{armRecoveryPresentation(key);markNativeQueueAdoption(key);}
    const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
    vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});
    function Probe(){const ref=useRef<HTMLAudioElement>(null);useNativeAudioDeck(ref,'A');return h('audio',{ref});}
    usePlaybackStore.setState({audioSrc:'https://fresh.test/38',currentSong:song,replayGainMode:'off',playerState:kind==='cold'?PlayerState.PAUSED:PlayerState.PLAYING});
    useAudioSettingsStore.setState({audioEqualizerSettings:{...settings.audioEqualizerSettings,enabled:false}});useAutomixSettingsStore.setState({automixEnabled:false});
    try{
        await act(async()=>root.render(h(Probe)));
        const prepares=port.command.mock.calls.filter(([c])=>c.action==='prepare');expect(prepares).toHaveLength(1);
        expect(prepares[0][0]).toMatchObject({songKey:key,position:kind==='cold'?123456:0,adopt:kind==='live'});
        expect(port.command.mock.calls.filter(([c])=>['play','seek','pause','detach'].includes(String(c.action)))).toHaveLength(0);
        expect(consumed).toHaveBeenCalledTimes(kind==='cold'?1:0);
    }finally{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();usePlaybackStore.setState(old);useAudioSettingsStore.setState(settings);useAutomixSettingsStore.setState(mix);}
});
it('cold recovery keeps its position until a real audio source is prepared',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;port.command.mockClear();
    const old=usePlaybackStore.getState(),settings=useAudioSettingsStore.getState(),mix=useAutomixSettingsStore.getState();
    const song:SongResult={id:38,name:'Recovered',artists:[],album:{id:1,name:'A'},durationMs:300000,sourceRef:{kind:'online',providerId:'qq',mediaId:'38'}};
    const key=getPlaybackSongKey(song),consumed=vi.fn();
    armRecoveryPosition(key,155000,consumed); // 02:35
    const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
    vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});
    function Probe(){const ref=useRef<HTMLAudioElement>(null);useNativeAudioDeck(ref,'A');return h('audio',{ref});}
    // 冷恢复刻意只记住歌曲、不打开音源，等用户按下播放才重新解析 URL。
    usePlaybackStore.setState({audioSrc:null,currentSong:song,replayGainMode:'off',playerState:PlayerState.PAUSED});
    useAudioSettingsStore.setState({audioEqualizerSettings:{...settings.audioEqualizerSettings,enabled:false}});useAutomixSettingsStore.setState({automixEnabled:false});
    try{
        await act(async()=>root.render(h(Probe)));
        // 空音源阶段既不能 prepare，也不能把一次性的恢复位置消费掉。
        expect(port.command.mock.calls.filter(([c])=>c.action==='prepare')).toHaveLength(0);
        expect(consumed).not.toHaveBeenCalled();
        // 音源解析完成后，这一次的 prepare 必须带着 02:35 而不是 0。
        await act(async()=>usePlaybackStore.setState({audioSrc:'https://fresh.test/38'}));
        const prepares=port.command.mock.calls.filter(([c])=>c.action==='prepare');
        expect(prepares).toHaveLength(1);
        expect(prepares[0][0]).toMatchObject({songKey:key,position:155000});
        expect(consumed).toHaveBeenCalledOnce();
    }finally{await act(async()=>root.unmount());host.remove();consumeRecoveryPresentation(key);vi.restoreAllMocks();usePlaybackStore.setState(old);useAudioSettingsStore.setState(settings);useAutomixSettingsStore.setState(mix);}
});
it('consumes the existing autoplay intent when a cold native probe becomes ready after the source',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    const saved=usePlaybackStore.getState(),audio=useAudioSettingsStore.getState(),mix=useAutomixSettingsStore.getState();
    let probe!:(v:any)=>void;port.probe.mockImplementationOnce(()=>new Promise(resolve=>{probe=resolve;}));port.command.mockClear();
    const intent={current:true},host=document.createElement('div');document.body.append(host);const root=createRoot(host);
    const song:SongResult={id:1,name:'Cold',durationMs:100000,artists:[],album:{id:1,name:''}};
    usePlaybackStore.setState({audioSrc:'https://audio.test/cold',currentSong:song,replayGainMode:'off',playerState:PlayerState.IDLE});
    useAudioSettingsStore.setState({audioEqualizerSettings:{...audio.audioEqualizerSettings,enabled:false}});useAutomixSettingsStore.setState({automixEnabled:false});
    function Probe(){const ref=useRef<HTMLAudioElement>(null);useNativeAudioDeck(ref,'A',undefined,undefined,intent);return h('audio',{ref});}
    try{
        await act(async()=>root.render(h(Probe)));expect(port.command).not.toHaveBeenCalled();
        await act(async()=>probe({supported:true,engine:'media3'}));
        expect(port.command.mock.calls.some(([c])=>c.action==='play')).toBe(true);expect(intent.current).toBe(false);
    }finally{await act(async()=>root.unmount());host.remove();usePlaybackStore.setState(saved);useAudioSettingsStore.setState(audio);useAutomixSettingsStore.setState(mix);}
});

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
import { armRecoveryPosition, armRecoveryPresentation } from '@/services/androidSessionRecovery';
import { markNativeQueueAdoption } from '@/services/nativeAudioElement';
import { getPlaybackSongKey } from '@/utils/appPlaybackGuards';

// test/unit/hooks/nativeAudioDeck.test.ts
const { port } = vi.hoisted(() => ({ port: {
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

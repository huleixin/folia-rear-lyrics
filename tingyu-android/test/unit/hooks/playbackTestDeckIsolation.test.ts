// @vitest-environment jsdom
import { act, createElement as h, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useNativeAudioDeck } from '@/hooks/useNativeAudioDeck';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useAudioSettingsStore } from '@/stores/useAudioSettingsStore';
import { useAutomixSettingsStore } from '@/stores/useAutomixSettingsStore';

// test/unit/hooks/playbackTestDeckIsolation.test.ts
const config = vi.hoisted(() => ({ engine: 'web', probe: vi.fn(), command: vi.fn(), addListener: vi.fn(),compatiblePlayback:vi.fn(async()=>({accepted:true})) }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => config }));
vi.mock('@/utils/playbackEngineTestBuild', () => ({ PLAYBACK_TEST_BUILD: true, get PLAYBACK_TEST_SESSION_ENGINE() { return config.engine; } }));
vi.mock('@/utils/platform', () => ({ isAndroidNativeRuntime: () => true }));
vi.mock('@/hooks/useStageActivity', () => ({ useMainStageActive: () => false }));
it('does not probe native output with the default stable selection; a timed-out probe restores real src and ignores late success', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const playback = usePlaybackStore.getState(), audio = useAudioSettingsStore.getState(), mix = useAutomixSettingsStore.getState();
    const load=vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{}),pause=vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
    usePlaybackStore.setState({ audioSrc: 'https://audio.example/test.mp3', replayGainMode: 'off' });
    useAudioSettingsStore.setState({ audioEqualizerSettings: { ...audio.audioEqualizerSettings, enabled: false } });
    useAutomixSettingsStore.setState({ automixEnabled: false });
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    function Probe() { const ref = useRef<HTMLAudioElement>(null), deck = useNativeAudioDeck(ref, 'A');
        return h('audio', { ref, src: deck.suppressBrowserSource ? undefined : 'https://audio.example/test.mp3' }); }
    try {
        await act(async () => root.render(h(Probe)));
        expect(config.probe).not.toHaveBeenCalled(); expect(host.querySelector('audio')?.getAttribute('src')).toContain('audio.example');
        await act(async () => root.render(null));
        config.engine = 'media3'; let reply!: (value: unknown) => void;
        config.probe.mockImplementation(() => new Promise(resolve => { reply = resolve; })); vi.useFakeTimers();
        await act(async () => root.render(h(Probe)));
        expect(host.querySelector('audio')?.hasAttribute('src')).toBe(false);
        await act(async () => { await vi.advanceTimersByTimeAsync(4001); });
        expect(host.querySelector('audio')?.getAttribute('src')).toContain('audio.example');
        await act(async () => reply({ supported: true, engine: 'late' }));
        expect(host.querySelector('audio')?.getAttribute('src')).toContain('audio.example'); expect(config.command).not.toHaveBeenCalled();
    } finally {
        await act(async () => root.unmount()); host.remove(); vi.useRealTimers();
        usePlaybackStore.setState(playback); useAudioSettingsStore.setState(audio); useAutomixSettingsStore.setState(mix);
        load.mockRestore();pause.mockRestore();
    }
});

it('hands the same track back to the WebView pipeline after a native failure', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const playback = usePlaybackStore.getState(), audio = useAudioSettingsStore.getState(), mix = useAutomixSettingsStore.getState();
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    usePlaybackStore.setState({ audioSrc: 'https://audio.example/test.mp3', replayGainMode: 'off' });
    useAudioSettingsStore.setState({ audioEqualizerSettings: { ...audio.audioEqualizerSettings, enabled: false } });
    useAutomixSettingsStore.setState({ automixEnabled: false });
    config.engine = 'media3';
    config.probe.mockImplementation(async () => ({ supported: true, engine: 'media3' }));
    let onNativeState!:(value:any)=>void;
    config.addListener.mockImplementation(async (_name,listener) => {onNativeState=listener;return { remove: async () => {} };});
    config.command.mockImplementation(async () => ({ accepted: true }));
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    function Probe() { const ref = useRef<HTMLAudioElement>(null), deck = useNativeAudioDeck(ref, 'A');
        return h('audio', { ref, src: deck.suppressBrowserSource ? undefined : 'https://audio.example/test.mp3' }); }
    try {
        await act(async () => root.render(h(Probe)));
        expect(host.querySelector('audio')?.hasAttribute('src')).toBe(false);
        await act(async () => {
            const prepare=config.command.mock.calls.filter(([value])=>value.action==='prepare').at(-1)![0];
            onNativeState({id:prepare.id,sequence:prepare.sequence,type:'state',position:0,duration:200,buffered:0,playing:false,paused:true,status:1,errorCode:4005,message:'ERROR_CODE_DECODING_FAILED'});
            await new Promise(resolve => setTimeout(resolve));
            await new Promise(resolve => setTimeout(resolve));
        });
        expect(host.querySelector('audio')?.getAttribute('src')).toContain('audio.example');
        expect(config.command.mock.calls.some(([value]) => value.action === 'detach')).toBe(true);
        // A decoder fallback belongs to this attempt, not to the Activity/session.
        await act(async () => usePlaybackStore.setState({ audioSrc: 'https://audio.example/next.mp3' }));
        await act(async () => { await new Promise(resolve => setTimeout(resolve)); });
        expect(config.command.mock.calls.filter(([value]) => value.action === 'prepare').at(-1)?.[0].uri).toBe('https://audio.example/next.mp3');
    } finally {
        await act(async () => root.unmount()); host.remove(); load.mockRestore();pause.mockRestore();
        usePlaybackStore.setState(playback); useAudioSettingsStore.setState(audio); useAutomixSettingsStore.setState(mix);
    }
});

it('waits for old output acknowledgement and discards an intermediate fallback during rapid navigation',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    const saved=usePlaybackStore.getState(),audio=useAudioSettingsStore.getState(),mix=useAutomixSettingsStore.getState();
    const load=vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{}),pause=vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
    config.engine='media3';config.probe.mockResolvedValue({supported:true});config.command.mockClear();
    let listener!:(v:any)=>void,release!:(v:any)=>void;
    config.addListener.mockImplementation(async(_name,fn)=>{listener=fn;return{remove:async()=>{}};});
    config.command.mockImplementation(async c=>c.action==='detach'?new Promise(resolve=>{release=resolve;}):({accepted:true}));
    usePlaybackStore.setState({audioSrc:'https://audio.test/A',currentSong:null,replayGainMode:'off'});
    useAudioSettingsStore.setState({audioEqualizerSettings:{...audio.audioEqualizerSettings,enabled:false}});useAutomixSettingsStore.setState({automixEnabled:false});
    const rootHost=document.createElement('div');document.body.append(rootHost);const root=createRoot(rootHost),competingError=vi.fn();
    function Probe(){const ref=useRef<HTMLAudioElement>(null);const d=useNativeAudioDeck(ref,'A');return h('audio',{ref,src:d.suppressBrowserSource?undefined:usePlaybackStore.getState().audioSrc??undefined,onError:competingError});}
    const flush=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});};
    try{
        await act(async()=>root.render(h(Probe)));const prepared=config.command.mock.calls.find(([c])=>c.action==='prepare')![0];
        await act(async()=>listener({id:prepared.id,sequence:prepared.sequence,type:'state',position:0,duration:200,buffered:0,playing:false,paused:true,status:1,errorCode:4005}));await flush();
        expect(competingError).not.toHaveBeenCalled();
        await act(async()=>usePlaybackStore.setState({audioSrc:'https://audio.test/B'}));await flush();
        expect(config.command.mock.calls.filter(([c])=>c.action==='prepare')).toHaveLength(1);
        await act(async()=>release({accepted:true}));await flush();
        expect(config.command.mock.calls.filter(([c])=>c.action==='prepare').at(-1)![0].uri).toBe('https://audio.test/B');
        expect(rootHost.querySelector('audio')!.hasAttribute('src')).toBe(false);
        config.command.mockResolvedValue({accepted:true});
    }finally{config.command.mockResolvedValue({accepted:true});await act(async()=>root.unmount());rootHost.remove();load.mockRestore();pause.mockRestore();usePlaybackStore.setState(saved);useAudioSettingsStore.setState(audio);useAutomixSettingsStore.setState(mix);}
});

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
import { PlayerState } from '@/types';

// test/unit/hooks/nativeAudioDeck.test.ts
const { port } = vi.hoisted(() => ({ port: {
    probe: vi.fn(async () => ({ supported: true, engine: 'test' })),
    command: vi.fn(async (_value: Record<string, unknown>) => ({ accepted: true })),
    addListener: vi.fn(async () => ({ remove: async () => {} })),
} }));
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
        await act(async()=>useAppViewStore.setState({view:'player'}));expect(analysis()).toBe(true);
        await act(async()=>useAppViewStore.setState({view:'home'}));expect(analysis()).toBe(false);
        await act(async()=>useRearRuntimeStore.setState({enabled:true,sleeping:false}));expect(analysis()).toBe(true);
        await act(async()=>useRearRuntimeStore.setState({sleeping:true}));expect(analysis()).toBe(false);
        expect(port.command.mock.calls.filter(([c])=>c.action==='prepare')).toHaveLength(1);
    } finally {
        await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();usePlaybackStore.setState(playback);useAudioSettingsStore.setState(audio);useAutomixSettingsStore.setState(mix);useAppViewStore.setState(view);useRearRuntimeStore.setState(rear);
    }
});

// @vitest-environment jsdom
import { act, createElement as h, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useNativeAudioDeck } from '@/hooks/useNativeAudioDeck';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useAudioSettingsStore } from '@/stores/useAudioSettingsStore';
import { useAutomixSettingsStore } from '@/stores/useAutomixSettingsStore';

// test/unit/hooks/playbackTestDeckIsolation.test.ts
const config = vi.hoisted(() => ({ engine: 'web', probe: vi.fn(), command: vi.fn(), addListener: vi.fn() }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => config }));
vi.mock('@/utils/playbackEngineTestBuild', () => ({ PLAYBACK_TEST_BUILD: true, get PLAYBACK_TEST_SESSION_ENGINE() { return config.engine; } }));
vi.mock('@/utils/platform', () => ({ isAndroidNativeRuntime: () => true }));
vi.mock('@/hooks/useStageActivity', () => ({ useMainStageActive: () => false }));
it('does not probe native output with the default stable selection; a timed-out probe restores real src and ignores late success', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const playback = usePlaybackStore.getState(), audio = useAudioSettingsStore.getState(), mix = useAutomixSettingsStore.getState();
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
    }
});

it('hands the same track back to the WebView pipeline after a native failure', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const playback = usePlaybackStore.getState(), audio = useAudioSettingsStore.getState(), mix = useAutomixSettingsStore.getState();
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    usePlaybackStore.setState({ audioSrc: 'https://audio.example/test.mp3', replayGainMode: 'off' });
    useAudioSettingsStore.setState({ audioEqualizerSettings: { ...audio.audioEqualizerSettings, enabled: false } });
    useAutomixSettingsStore.setState({ automixEnabled: false });
    config.engine = 'media3';
    config.probe.mockImplementation(async () => ({ supported: true, engine: 'media3' }));
    config.addListener.mockImplementation(async () => ({ remove: async () => {} }));
    config.command.mockImplementation(async () => ({ accepted: true }));
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    function Probe() { const ref = useRef<HTMLAudioElement>(null), deck = useNativeAudioDeck(ref, 'A');
        return h('audio', { ref, src: deck.suppressBrowserSource ? undefined : 'https://audio.example/test.mp3' }); }
    try {
        await act(async () => root.render(h(Probe)));
        expect(host.querySelector('audio')?.hasAttribute('src')).toBe(false);
        await act(async () => {
            host.querySelector('audio')!.dispatchEvent(new Event('error'));
            await new Promise(resolve => setTimeout(resolve));
            await new Promise(resolve => setTimeout(resolve));
        });
        expect(host.querySelector('audio')?.getAttribute('src')).toContain('audio.example');
        expect(config.command.mock.calls.some(([value]) => value.action === 'detach')).toBe(true);
    } finally {
        await act(async () => root.unmount()); host.remove(); load.mockRestore();
        usePlaybackStore.setState(playback); useAudioSettingsStore.setState(audio); useAutomixSettingsStore.setState(mix);
    }
});

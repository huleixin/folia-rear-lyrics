// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAudioQualitySwitch } from '@/hooks/useAudioQualitySwitch';
import { useAudioToolsStore as tools } from '@/stores/useAudioToolsStore';
import { usePlaybackStore as playback } from '@/stores/usePlaybackStore';
import type { OnlineRecoveryResult } from '@/types/playbackFailure';
import type { SongResult } from '@/types';

// test/unit/hooks/audioQualitySwitch.test.ts
const setQuality = vi.hoisted(() => vi.fn());
vi.mock('@/stores/useAudioSettingsStore', () => ({ useAudioSettingsStore: { getState: () => ({ audioQuality: 'lossless', setAudioQuality: setQuality }) } }));
vi.mock('@/stores/useLxSourceStore', () => ({ useLxSourceStore: { subscribe: () => () => undefined } }));
vi.mock('@/stores/usePlaybackStore', async () => {
    const { create } = await import('zustand');
    return { usePlaybackStore: create(() => ({ currentSong: null, playerState: 0 })) };
});
vi.mock('@/utils/appPlaybackGuards', () => ({ getPlaybackSongKey: (song: SongResult) => song.id }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
const recover = vi.fn<(_: unknown) => Promise<OnlineRecoveryResult>>();
function Harness() { useAudioQualitySwitch(recover); return null; }
const song = (id: string) => ({ id } as SongResult);
beforeEach(() => {
    recover.mockReset(); setQuality.mockClear();
    tools.setState({ request: null, switching: false, error: '', actual: null });
    playback.setState({ currentSong: song('one') });
    root = createRoot(document.createElement('div'));
    act(() => root.render(createElement(Harness)));
});
afterEach(() => act(() => root.unmount()));
const pick = async () => { await act(async () => { tools.getState().switchQuality('high'); }); };
it('reports a non-attempted switch and unlocks the buttons', async () => {
    recover.mockResolvedValue({ status: 'not-attempted' }); await pick();
    expect(tools.getState().error).toContain('重新播放');
    expect(tools.getState().switching).toBe(false);
    expect(setQuality).not.toHaveBeenCalled();
});
it('saves the preference only after successful recovery', async () => {
    recover.mockResolvedValue({ status: 'recovered' }); await pick();
    expect(setQuality).toHaveBeenCalledWith('high');
    expect(recover).toHaveBeenCalledWith(expect.objectContaining({ force: true, bypassMediaCache: true, qualityOverride: 'high' }));
});
it('keeps the original quality and permits retry on rejection', async () => {
    recover.mockRejectedValue(new Error('probe failed')); await pick();
    expect(tools.getState().error).toContain('继续播放原音质');
    expect(tools.getState().switching).toBe(false);
    expect(setQuality).not.toHaveBeenCalled();
});
it('does not restore old metadata over a newly selected song', async () => {
    let finish!: (r: OnlineRecoveryResult) => void;
    recover.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await pick();
    await act(async () => {
        playback.setState({ currentSong: song('two') });
        tools.setState({ actual: { key: 'two', quality: 'standard' } });
        finish({ status: 'failed', failure: { reason: 'network', stage: 'refresh' } });
    });
    expect(tools.getState().actual?.key).toBe('two');
    expect(tools.getState().error).toBe('');
    expect(tools.getState().switching).toBe(false);
});

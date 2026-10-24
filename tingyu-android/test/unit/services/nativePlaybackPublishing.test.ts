// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildNativePlaybackPayload, createNativePlaybackPublisher } from '@/services/nativePlaybackBridge';
import type { SongResult } from '@/types';

// test/unit/services/nativePlaybackPublishing.test.ts
vi.mock('@/stores/motionSignals', () => ({ currentTime: { get: () => 0 } }));
vi.mock('@/stores/usePlaybackStore', () => ({
    usePlaybackStore: { getState: () => ({}), subscribe: () => () => undefined },
    selectDisplaySong: () => null, selectDisplayPlayerState: () => 'idle', selectDisplayDuration: () => 0,
}));
const song = { id: 42, name: '真实歌曲', artists: [{ id: 1, name: '歌手甲' }, { id: 2, name: '歌手乙' }],
    album: { id: 3, name: '真实专辑', coverUrl: 'https://example.test/cover.jpg' }, durationMs: 234567 } as SongResult;
const track = (name = '真实歌曲') => buildNativePlaybackPayload({ ...song, name }, true, 5, 0);
const settle = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };

describe('native media publication', () => {
    it('publishes real metadata and song duration before the audio duration is available', () => {
        expect(track()).toMatchObject({ title: '真实歌曲', artist: '歌手甲 / 歌手乙', album: '真实专辑',
            coverUrl: 'https://example.test/cover.jpg', duration: 234567, position: 5000 });
        expect(buildNativePlaybackPayload(song, false, Number.NaN, 10).position).toBe(0);
        expect(buildNativePlaybackPayload(song, true, 0, 10).duration).toBe(10000);
    });
    it('retries failed writes instead of treating an unpublished track as acknowledged', async () => {
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const plugin = { updatePlaybackState: vi.fn().mockRejectedValueOnce(new Error('bridge not ready')).mockResolvedValue({}),
            clearPlaybackState: vi.fn().mockResolvedValue({}) };
        const publish = createNativePlaybackPublisher(plugin);
        publish(track()); await settle(); publish(track()); await settle(); publish(track()); await settle();
        expect(plugin.updatePlaybackState).toHaveBeenCalledTimes(2); warning.mockRestore();
    });
    it('serializes writes and drops superseded pending tracks, including a clear followed by a new song', async () => {
        let finish!: () => void;
        const plugin = { updatePlaybackState: vi.fn().mockImplementationOnce(() => new Promise<void>(r => { finish = r; })).mockResolvedValue({}),
            clearPlaybackState: vi.fn().mockResolvedValue({}) };
        const publish = createNativePlaybackPublisher(plugin);
        publish(track('A')); publish(track('B')); publish(null); publish(track('C'));
        expect(plugin.updatePlaybackState).toHaveBeenCalledTimes(1);
        finish(); await settle();
        expect(plugin.updatePlaybackState.mock.calls.map(([value]) => value.title)).toEqual(['A', 'C']);
        expect(plugin.clearPlaybackState).not.toHaveBeenCalled();
    });
    it('deduplicates empty states and metadata but sends changed duration and explicit clock refresh', async () => {
        const plugin = { updatePlaybackState: vi.fn().mockResolvedValue({}), clearPlaybackState: vi.fn().mockResolvedValue({}) };
        const publish = createNativePlaybackPublisher(plugin);
        publish(null); await settle(); publish(null); await settle(); expect(plugin.clearPlaybackState).toHaveBeenCalledOnce();
        publish(track()); await settle(); publish({ ...track(), position: 999 }); await settle();
        expect(plugin.updatePlaybackState).toHaveBeenCalledOnce();
        publish({ ...track(), duration: 250000 }); await settle();
        publish({ ...track(), duration: 250000 }, { force: true }); await settle();
        expect(plugin.updatePlaybackState).toHaveBeenCalledTimes(3);
    });
    it('recovers from a dropped reply without letting the old promise stall a newer song forever', async () => {
        vi.useFakeTimers(); const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const plugin = { updatePlaybackState: vi.fn().mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue({}),
                clearPlaybackState: vi.fn().mockResolvedValue({}) };
            const publish = createNativePlaybackPublisher(plugin);
            publish(track('A')); publish(track('B')); await vi.advanceTimersByTimeAsync(4000); await settle();
            expect(plugin.updatePlaybackState.mock.calls.map(([value]) => value.title)).toEqual(['A', 'B']);
            expect(vi.getTimerCount()).toBe(0);
        } finally { vi.useRealTimers(); warning.mockRestore(); }
    });

});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedSong } from '@/types';
import { omni } from '@/services/onlineMusic/omni';
import { matchesPlaybackRecording, playbackUrlIdentity, resolvePlaybackFallback } from '@/services/onlineMusic/playbackFallback';
import { resolvedAudioCacheKey } from '@/services/onlineMusic/audioSourceBinding';
import { useLxSourceStore } from '@/stores/useLxSourceStore';

// test/unit/onlineMusic/playbackFallback.test.ts
const song = (providerId = 'qq', extra: Partial<UnifiedSong> = {}): UnifiedSong => ({
    id: '123', name: '晴天', artists: [{ id: 'a', name: '周杰伦' }], album: { id: 'b', name: '叶惠美' },
    durationMs: 240000, sourceRef: { kind: 'online', providerId, mediaId: '123' }, ...extra,
});
const source = { url: 'https://cdn.example/backup.mp3', fetchedAt: 1, quality: 'high' as const };

describe('strict recording matching', () => {
    it('accepts formatting and a small duration difference', () => {
        expect(matchesPlaybackRecording(song(), song('netease', { name: ' 晴天 ', durationMs: 241000 }))).toBe(true);
    });
    it.each([
        { name: '晴天 (Live)' }, { name: '晴天 (伴奏)' }, { name: '晴天 Remix' },
        { artists: [{ id: 'b', name: '另一位歌手' }] }, { artists: [] }, { durationMs: 30000 }, { durationMs: 0 },
    ])('rejects a different/unknown recording: %j', extra => {
        expect(matchesPlaybackRecording(song(), song('netease', extra))).toBe(false);
    });
    it('ignores URL signing tokens', () => {
        expect(playbackUrlIdentity(source.url + '?old=1')).toBe(playbackUrlIdentity(source.url + '?new=1'));
    });
});

describe('cross-platform resolution', () => {
    beforeEach(() => {
        useLxSourceStore.setState({ activeId: null });
        vi.spyOn(omni, 'getProviderSummaries').mockReturnValue([
            { providerId: 'qq', availability: { configured: true } },
            { providerId: 'netease', availability: { configured: true } },
        ] as ReturnType<typeof omni.getProviderSummaries>);
        vi.spyOn(omni, 'getProviderCapabilities').mockReturnValue({ search: true, playback: true } as ReturnType<typeof omni.getProviderCapabilities>);
        vi.spyOn(omni, 'searchProviderSongs').mockResolvedValue({ items: [song('netease')], hasMore: false, nextOffset: 1 });
    });
    afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); useLxSourceStore.setState({ activeId: null }); });
    it('rescues failure without rewriting identity or caching backup bytes under the original song', async () => {
        vi.spyOn(omni, 'getPrimaryAudioSource').mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(source);
        const original = song();
        expect((await omni.getAudioSource(original, 'high'))?.backupSource).toEqual({ providerId: 'netease', mediaId: '123' });
        expect(original.sourceRef).toMatchObject({ providerId: 'qq', mediaId: '123' });
        expect(resolvedAudioCacheKey(original, source.url)).toBeNull();
    });
    it('never searches when the primary source works', async () => {
        vi.spyOn(omni, 'getPrimaryAudioSource').mockResolvedValue(source);
        expect(await omni.getAudioSource(song(), 'high')).toBe(source);
        expect(omni.searchProviderSongs).not.toHaveBeenCalled();
    });
    it('skips the cooling-down primary while resolving a backup', async () => {
        const resolve = vi.spyOn(omni, 'getPrimaryAudioSource').mockResolvedValue(source);
        const result = await omni.getAudioSource(song(), 'high', { skipPrimary: true });
        expect(resolve).toHaveBeenCalledTimes(1);
        expect(resolve.mock.calls[0][0].sourceRef).toMatchObject({ providerId: 'netease' });
        expect(result?.backupSource?.providerId).toBe('netease');
        expect(result?.replayGain).toEqual({ trackGain: 0, albumGain: 0, trackPeak: 1, albumPeak: 1 });
    });
    it('propagates source-change cancellation without trying another provider', async () => {
        vi.spyOn(omni, 'getPrimaryAudioSource').mockRejectedValue(new DOMException('Source changed', 'AbortError'));
        await expect(resolvePlaybackFallback(song(), 'high')).rejects.toMatchObject({ name: 'AbortError' });
    });
    it('rejects failed media files even with new signing tokens', async () => {
        vi.spyOn(omni, 'getPrimaryAudioSource').mockResolvedValue({ ...source, url: source.url + '?new=1' });
        expect(await omni.getAudioSource(song(), 'high', { excludedUrls: new Set([source.url]) })).toBeNull();
    });
    it('preserves the original failure when a backup refuses full playback', async () => {
        const original = new Error('original refused');
        vi.spyOn(omni, 'getPrimaryAudioSource').mockRejectedValueOnce(original).mockRejectedValueOnce(new Error('preview-only'));
        await expect(omni.getAudioSource(song(), 'high')).rejects.toBe(original);
    });
    it('cancels stale search results before resolving candidates', async () => {
        let current = true;
        vi.mocked(omni.searchProviderSongs).mockImplementation(async () => { current = false; return { items: [song('netease')], hasMore: false, nextOffset: 1 }; });
        const resolve = vi.spyOn(omni, 'getPrimaryAudioSource');
        await expect(resolvePlaybackFallback(song(), 'high', { isCurrent: () => current })).rejects.toMatchObject({ name: 'AbortError' });
        expect(resolve).not.toHaveBeenCalled();
    });
    it('bounds stalled catalog requests', async () => {
        vi.useFakeTimers();
        vi.mocked(omni.searchProviderSongs).mockImplementation(() => new Promise(() => {}));
        const task = resolvePlaybackFallback(song(), 'high');
        await vi.advanceTimersByTimeAsync(5001);
        expect(await task).toBeNull();
    });
    it('keeps an explicitly selected script in control', async () => {
        useLxSourceStore.setState({ activeId: 'selected-script' });
        vi.spyOn(omni, 'getPrimaryAudioSource').mockRejectedValue(new Error('script failed'));
        await expect(omni.getAudioSource(song(), 'high')).rejects.toThrow('script failed');
        expect(omni.searchProviderSongs).not.toHaveBeenCalled();
    });
});

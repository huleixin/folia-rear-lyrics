import { describe, expect, it, vi } from 'vitest';
import { buildNativePlaybackIdentity } from '@/services/nativePlaybackBridge';

// test/unit/services/nativePlaybackBridge.test.ts
// 锁屏推送按内容去重：播放进度不属于「内容」。位置进身份的话，每秒的心跳都会让去重失效，
// 前台服务又会被重新启动一遍。

vi.mock('@/stores/motionSignals', () => ({ currentTime: { get: () => 0 } }));
vi.mock('@/stores/usePlaybackStore', () => ({
    usePlaybackStore: { getState: () => ({}), subscribe: () => () => undefined },
    selectDisplaySong: () => null,
    selectDisplayPlayerState: () => 'idle',
    selectDisplayDuration: () => 0,
}));
vi.mock('@/utils/appPlaybackGuards', () => ({ getPlaybackSongKey: () => '' }));

const payload = (overrides: Record<string, unknown> = {}) => ({
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    coverUrl: 'https://example.test/cover.jpg',
    songKey: 'netease:1',
    playing: true,
    position: 1_000,
    duration: 200_000,
    ...overrides,
});

describe('native playback push identity', () => {
    it('ignores progress-only changes', () => {
        expect(buildNativePlaybackIdentity(payload({ position: 1_000 })))
            .toBe(buildNativePlaybackIdentity(payload({ position: 99_000 })));
    });

    it('changes when anything the lock screen shows changes', () => {
        const base = buildNativePlaybackIdentity(payload());

        expect(buildNativePlaybackIdentity(payload({ title: 'Other' }))).not.toBe(base);
        expect(buildNativePlaybackIdentity(payload({ artist: 'Other' }))).not.toBe(base);
        expect(buildNativePlaybackIdentity(payload({ album: 'Other' }))).not.toBe(base);
        expect(buildNativePlaybackIdentity(payload({ coverUrl: 'https://example.test/2.jpg' }))).not.toBe(base);
        expect(buildNativePlaybackIdentity(payload({ songKey: 'netease:2' }))).not.toBe(base);
        expect(buildNativePlaybackIdentity(payload({ playing: false }))).not.toBe(base);
    });
});

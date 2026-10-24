import { describe, expect, it, vi } from 'vitest';
import {
    createMediaSessionPositionState,
    getSupportedMediaSessionArtworkUrl,
    isMediaSessionSourceReady,
    publishMediaSessionTrack,
} from '@/utils/mediaSessionSync';

// test/unit/utils/mediaSessionSync.test.ts

describe('mediaSessionSync', () => {
    it('ignores metadata events from an old or incomplete audio source', () => {
        expect(isMediaSessionSourceReady({
            currentSrc: 'https://music.example/old.mp3',
            readyState: 4,
            duration: 180,
        }, '/new.mp3', 'https://music.example/')).toBe(false);

        expect(isMediaSessionSourceReady({
            currentSrc: 'https://music.example/new.mp3',
            readyState: 0,
            duration: Number.NaN,
        }, '/new.mp3', 'https://music.example/')).toBe(false);
    });

    it('accepts the target source after its timeline becomes available', () => {
        expect(isMediaSessionSourceReady({
            currentSrc: 'https://music.example/new.mp3',
            readyState: 1,
            duration: 235.659,
        }, '/new.mp3', 'https://music.example/')).toBe(true);
    });

    it('clamps position into the Media Session timeline', () => {
        expect(createMediaSessionPositionState({
            currentTime: 240,
            duration: 235.659,
            playbackRate: 0,
        })).toEqual({
            duration: 235.659,
            playbackRate: 1,
            position: 235.659,
        });
    });

    it('accepts MediaImage protocols and rejects Electron custom cover URLs', () => {
        expect(getSupportedMediaSessionArtworkUrl('blob:http://localhost/cover-id')).toBe('blob:http://localhost/cover-id');
        expect(getSupportedMediaSessionArtworkUrl('/cover.png', 'https://music.example/player'))
            .toBe('https://music.example/cover.png');
        expect(getSupportedMediaSessionArtworkUrl('folia-cover://asset/sha256%3Aabc')).toBe('');
    });

    it('publishes a valid position before replacing metadata', () => {
        const calls: string[] = [];
        const mediaSession = {
            setPositionState: vi.fn(() => calls.push('position')),
            set metadata(_value: MediaMetadata | null) {
                calls.push('metadata');
            },
        } as unknown as MediaSession;

        const published = publishMediaSessionTrack(
            mediaSession,
            { currentTime: 0.011, duration: 220.187, playbackRate: 1 },
            {
                title: 'new track',
                artist: 'artist',
                album: 'album',
                artworkUrl: 'https://music.example/cover.png',
            },
            init => init as unknown as MediaMetadata
        );

        expect(published).toBe(true);
        expect(calls).toEqual(['position', 'metadata']);
        expect(mediaSession.setPositionState).toHaveBeenCalledWith({
            duration: 220.187,
            playbackRate: 1,
            position: 0.011,
        });
    });

    it('omits unsupported artwork protocols when metadata is published', () => {
        let metadata: MediaMetadataInit | undefined;
        const mediaSession = {
            setPositionState: vi.fn(),
            set metadata(_value: MediaMetadata | null) { },
        } as unknown as MediaSession;

        publishMediaSessionTrack(
            mediaSession,
            { currentTime: 10, duration: 200, playbackRate: 1 },
            {
                title: 'local track',
                artist: 'artist',
                album: 'album',
                artworkUrl: 'folia-cover://asset/sha256%3Aabc',
            },
            init => {
                metadata = init;
                return init as unknown as MediaMetadata;
            }
        );

        expect(metadata?.artwork).toEqual([]);
    });
    it.each(['missing', 'rejects', 'unknown-duration'])('keeps metadata when the position API %s', mode => {
        const metadata = vi.fn();
        const session = { setPositionState: mode === 'missing' ? undefined : vi.fn(() => { throw new Error('unsupported'); }),
            set metadata(value: unknown) { metadata(value); } } as unknown as MediaSession;
        expect(publishMediaSessionTrack(session, { currentTime: 1, duration: mode === 'unknown-duration' ? Infinity : 200, playbackRate: 1 },
            { title: 'Car track', artist: 'Real artist', album: 'Real album', artworkUrl: '' },
            init => init as unknown as MediaMetadata)).toBe(true);
        expect(metadata).toHaveBeenCalledWith(expect.objectContaining({ title: 'Car track', artist: 'Real artist' }));
        expect(isMediaSessionSourceReady({ currentSrc: 'https://example.test/song', readyState: 1, duration: Infinity }, 'https://example.test/song')).toBe(true);
    });

});

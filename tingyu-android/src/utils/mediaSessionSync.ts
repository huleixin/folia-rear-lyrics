// src/utils/mediaSessionSync.ts

export type MediaSessionTrackMetadata = {
    title: string;
    artist: string;
    album: string;
    artworkUrl: string;
};

type MediaSessionMetadataFactory = (init: MediaMetadataInit) => MediaMetadata;

const MEDIA_SESSION_ARTWORK_PROTOCOLS = new Set(['http:', 'https:', 'data:', 'blob:']);

const normalizeSourceUrl = (source: string, baseUrl?: string) => {
    try {
        return new URL(source, baseUrl).href;
    } catch {
        return source;
    }
};

export const getSupportedMediaSessionArtworkUrl = (source: string, baseUrl?: string): string => {
    const trimmedSource = source.trim();
    if (!trimmedSource) return '';

    try {
        const url = baseUrl ? new URL(trimmedSource, baseUrl) : new URL(trimmedSource);
        return MEDIA_SESSION_ARTWORK_PROTOCOLS.has(url.protocol)
            ? (baseUrl ? url.href : trimmedSource)
            : '';
    } catch {
        // Relative URLs are valid MediaImage sources; callers can provide baseUrl for strict resolution.
        return baseUrl ? '' : trimmedSource;
    }
};

// Rejects late events from the previous source; title publication does not require a finite timeline.
export const isMediaSessionSourceReady = (
    audio: Pick<HTMLAudioElement, 'currentSrc' | 'readyState' | 'duration'>,
    expectedSource: string,
    baseUrl?: string
) => {
    if (audio.readyState < 1) {
        return false;
    }

    if (!audio.currentSrc) {
        return false;
    }

    return normalizeSourceUrl(audio.currentSrc, baseUrl) === normalizeSourceUrl(expectedSource, baseUrl);
};

export const createMediaSessionPositionState = (
    audio: Pick<HTMLAudioElement, 'currentTime' | 'duration' | 'playbackRate'>
): MediaPositionState | null => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        return null;
    }

    const position = Number.isFinite(audio.currentTime)
        ? Math.min(Math.max(audio.currentTime, 0), audio.duration)
        : 0;
    const playbackRate = Number.isFinite(audio.playbackRate) && audio.playbackRate > 0
        ? audio.playbackRate
        : 1;

    return {
        duration: audio.duration,
        playbackRate,
        position,
    };
};

// Publish a usable clock first when supported, but a WebView clock failure must not discard song metadata.
export const publishMediaSessionTrack = (
    mediaSession: MediaSession,
    audio: Pick<HTMLAudioElement, 'currentTime' | 'duration' | 'playbackRate'>,
    track: MediaSessionTrackMetadata,
    createMetadata: MediaSessionMetadataFactory = init => new MediaMetadata(init)
) => {
    const positionState = createMediaSessionPositionState(audio);
    if (positionState && typeof mediaSession.setPositionState === 'function') {
        try { mediaSession.setPositionState(positionState); }
        catch { /* Older WebViews can expose the method but reject it. Metadata still works. */ }
    }
    const artworkUrl = getSupportedMediaSessionArtworkUrl(track.artworkUrl);
    mediaSession.metadata = createMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: artworkUrl ? [{ src: artworkUrl }] : [],
    });
    return true;
};

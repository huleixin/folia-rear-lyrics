// src/utils/playbackRequestGuard.ts
// A captured view of existing playback/request generations, never a new playback authority.
export type PlaybackRequestIdentity = { songKey: string | number | null; generation: number; request: number; sourceRevision: number };
export function capturePlaybackRequest(expectedKey: string | number | null, read: () => PlaybackRequestIdentity, onDiscard?: (reason: string) => void) {
    const captured = { ...read() };
    let reported = false;
    return () => {
        const live = read();
        const reason = expectedKey === null || captured.songKey !== expectedKey || live.songKey !== expectedKey ? 'song-changed'
            : live.generation !== captured.generation ? 'playback-generation'
            : live.request !== captured.request ? 'newer-edit'
            : live.sourceRevision !== captured.sourceRevision ? 'library-request' : '';
        if (reason && !reported) { reported = true; onDiscard?.(reason); }
        return !reason;
    };
}

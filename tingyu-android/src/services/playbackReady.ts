import { usePlaybackStore } from '../stores/usePlaybackStore';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { retryRememberedPlaybackSource } from '../components/app/playback/restorePlaybackSource';

// src/services/playbackReady.ts
// A play press during restore belongs to that song, and remains cancellable by Pause/skip.
export function isPlaybackSourceCommitted(audio: HTMLAudioElement | null, source: string | null): boolean {
    if (!audio || !source) return false;
    // Small transport hosts/tests may provide an element adapter rather than a DOM node.
    if (typeof audio.getAttribute !== 'function') return true;
    const attribute = audio.getAttribute('src');
    if (!attribute) return false;
    try { return new URL(attribute, document.baseURI).href === new URL(source, document.baseURI).href; }
    catch { return attribute === source; }
}
export function waitForPlaybackReady(getAudio: () => HTMLAudioElement | null, signal: AbortSignal): Promise<void> {
    const song = usePlaybackStore.getState().currentSong;
    const key = song ? getPlaybackSongKey(song) : null;
    return new Promise((resolve, reject) => {
        let done = false;
        let deadline: ReturnType<typeof setTimeout>;
        let probeTimer: ReturnType<typeof setInterval>;
        const finish = (error?: Error) => {
            if (done) return;
            done = true; unsubscribe(); clearTimeout(deadline); clearInterval(probeTimer);
            signal.removeEventListener('abort', abort);
            error ? reject(error) : resolve();
        };
        const abort = () => finish(new DOMException('Playback request cancelled', 'AbortError'));
        const probe = () => {
            const state = usePlaybackStore.getState();
            if ((state.currentSong ? getPlaybackSongKey(state.currentSong) : null) !== key) { abort(); return; }
            if (isPlaybackSourceCommitted(getAudio(), state.audioSrc)) finish();
        };
        const unsubscribe = usePlaybackStore.subscribe(probe);
        signal.addEventListener('abort', abort, { once: true });
        deadline = setTimeout(() => finish(new Error('Playback source timed out')), 30_000);
        // Refs may mount after the source store publishes. Only this pending press owns the timer.
        probeTimer = setInterval(probe, 25);
        if (signal.aborted) { abort(); return; }
        probe();
        if (done) return;
        const restoring = retryRememberedPlaybackSource();
        if (restoring) void restoring.then(outcome => {
            if (!done && outcome !== 'restored') finish(new Error('Remembered source could not be restored'));
            else probe();
        }, error => finish(error instanceof Error ? error : new Error(String(error))));
    });
}

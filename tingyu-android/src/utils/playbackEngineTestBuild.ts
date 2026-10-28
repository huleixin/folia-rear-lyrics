// src/utils/playbackEngineTestBuild.ts
export const PLAYBACK_TEST_BUILD = import.meta.env.VITE_TINGYU_PLAYBACK_TEST === 'true';
export type PlaybackTestEngine = 'web' | 'media3';
export const PLAYBACK_TEST_SELECTION_KEY = 'tingyu_playback_test_engine_v1';
export function readStoredPlaybackEngine(fallback: PlaybackTestEngine): PlaybackTestEngine {
    try { const value = localStorage.getItem(PLAYBACK_TEST_SELECTION_KEY); return value === 'media3' || value === 'web' ? value : fallback; }
    catch { return fallback; }
}
// Shipping builds prefer native output. The diagnostic app keeps its stable baseline so a
// comparison never silently changes the engine under the tester.
export const readPlaybackTestEngine = (): PlaybackTestEngine =>
    readStoredPlaybackEngine(PLAYBACK_TEST_BUILD ? 'web' : 'media3');
// Selection changes apply only after an explicit, acknowledged stop and page reload.
export const PLAYBACK_TEST_SESSION_ENGINE = readPlaybackTestEngine();

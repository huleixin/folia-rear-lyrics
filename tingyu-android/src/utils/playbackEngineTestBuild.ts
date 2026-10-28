// src/utils/playbackEngineTestBuild.ts
export const PLAYBACK_TEST_BUILD = import.meta.env.VITE_TINGYU_PLAYBACK_TEST === 'true';
export type PlaybackTestEngine = 'web' | 'media3';
export const PLAYBACK_TEST_SELECTION_KEY = 'tingyu_playback_test_engine_v1';
export function readPlaybackTestEngine(): PlaybackTestEngine {
    try { return PLAYBACK_TEST_BUILD && localStorage.getItem(PLAYBACK_TEST_SELECTION_KEY) === 'media3' ? 'media3' : 'web'; }
    catch { return 'web'; }
}
// Selection changes apply only after an explicit, acknowledged stop and page reload.
export const PLAYBACK_TEST_SESSION_ENGINE = readPlaybackTestEngine();

// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

// test/unit/utils/playbackEngineTestBuild.test.ts
afterEach(() => { vi.unstubAllEnvs(); localStorage.clear(); vi.resetModules(); });
it('shipping builds prefer native and honour a stored compatible selection', async () => {
    vi.stubEnv('VITE_TINGYU_PLAYBACK_TEST', 'false');
    const build = await import('@/utils/playbackEngineTestBuild');
    expect(build.PLAYBACK_TEST_BUILD).toBe(false);
    expect(build.PLAYBACK_TEST_SESSION_ENGINE).toBe('media3');
    expect(build.readStoredPlaybackEngine('media3')).toBe('media3');
    localStorage.setItem(build.PLAYBACK_TEST_SELECTION_KEY, 'web');
    expect(build.readStoredPlaybackEngine('media3')).toBe('web');
    vi.resetModules(); expect((await import('@/utils/playbackEngineTestBuild')).PLAYBACK_TEST_SESSION_ENGINE).toBe('web');
});
it('a stored value that is neither engine falls back instead of being trusted', async () => {
    vi.stubEnv('VITE_TINGYU_PLAYBACK_TEST', 'false');
    const build = await import('@/utils/playbackEngineTestBuild');
    localStorage.setItem(build.PLAYBACK_TEST_SELECTION_KEY, 'quic');
    expect(build.readStoredPlaybackEngine('media3')).toBe('media3');
});
it('diagnostic builds keep the stable baseline and defer changes to the next session', async () => {
    vi.stubEnv('VITE_TINGYU_PLAYBACK_TEST', 'true'); vi.resetModules();
    const build = await import('@/utils/playbackEngineTestBuild');
    expect(build.PLAYBACK_TEST_SESSION_ENGINE).toBe('web');
    localStorage.setItem(build.PLAYBACK_TEST_SELECTION_KEY, 'media3');
    expect(build.readPlaybackTestEngine()).toBe('media3'); expect(build.PLAYBACK_TEST_SESSION_ENGINE).toBe('web');
    vi.resetModules(); expect((await import('@/utils/playbackEngineTestBuild')).PLAYBACK_TEST_SESSION_ENGINE).toBe('media3');
});

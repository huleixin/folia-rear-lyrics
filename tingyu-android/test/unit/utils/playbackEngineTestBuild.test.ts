// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

// test/unit/utils/playbackEngineTestBuild.test.ts
afterEach(() => { vi.unstubAllEnvs(); localStorage.clear(); vi.resetModules(); });
it('ordinary builds ignore a stored experimental selection', async () => {
    vi.stubEnv('VITE_TINGYU_PLAYBACK_TEST', 'false');
    localStorage.setItem('tingyu_playback_test_engine_v1', 'media3'); vi.resetModules();
    const build = await import('@/utils/playbackEngineTestBuild');
    expect(build.PLAYBACK_TEST_BUILD).toBe(false); expect(build.PLAYBACK_TEST_SESSION_ENGINE).toBe('web');
});
it('test builds default to stable and defer selection changes until the next session', async () => {
    vi.stubEnv('VITE_TINGYU_PLAYBACK_TEST', 'true'); vi.resetModules();
    const build = await import('@/utils/playbackEngineTestBuild');
    expect(build.PLAYBACK_TEST_SESSION_ENGINE).toBe('web');
    localStorage.setItem(build.PLAYBACK_TEST_SELECTION_KEY, 'media3');
    expect(build.readPlaybackTestEngine()).toBe('media3'); expect(build.PLAYBACK_TEST_SESSION_ENGINE).toBe('web');
    vi.resetModules(); expect((await import('@/utils/playbackEngineTestBuild')).PLAYBACK_TEST_SESSION_ENGINE).toBe('media3');
});

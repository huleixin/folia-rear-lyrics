// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { attachNativeAudioElement, blockNativeAudioCommandsForTest } from '@/services/nativeAudioElement';

// test/unit/services/playbackTestStopBarrier.test.ts
vi.mock('@/utils/playbackEngineTestBuild', () => ({ PLAYBACK_TEST_BUILD: true, PLAYBACK_TEST_SESSION_ENGINE: 'media3' }));
it('cannot revive native playback through an old queued Play after a test reset', async () => {
    const element = document.createElement('audio'), commands: string[] = [];
    let finishPrepare!: () => void;
    const adapter = attachNativeAudioElement(element, {
        probe: async () => ({ supported: true, engine: 'test' }),
        addListener: async () => ({ remove: async () => {} }),
        command: async value => { commands.push(String(value.action)); if (value.action === 'prepare') await new Promise<void>(resolve => { finishPrepare = resolve; }); return { accepted: true }; },
    });
    element.pause();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(commands).toEqual([]);
    adapter.setSource('https://test.example/audio.mp3', 'test');
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const played = element.play().catch(error => error.name);
    blockNativeAudioCommandsForTest(); element.pause();
    expect(await played).toBe('AbortError'); finishPrepare();
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(commands).toEqual(['prepare']);
    await adapter.dispose().catch(() => {});
});

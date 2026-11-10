import { afterEach, expect, it, vi } from 'vitest';
import { resolveRearRandomVisualizer } from '@/services/rearRandomVisualizer';
import { resolveRearStageConfig, validateRearAppearance } from '@/services/rearStageAppearance';
import { pickSongVisualizerMode } from '@/utils/randomVisualizerModes';
import { createRearLyricsTransport } from '@/services/rearLyricsTransport';
import type { ObsBrowserSourceConfig } from '@/types/obsBrowserSource';

// test/unit/services/rearRandomVisualizer.test.ts
const front = { hasTrack: true, playbackSongKey: 'qq:A', song: { id: 'A', name: 'A' }, visualizerMode: 'classic',
    theme: { name: 'Front' }, randomVisualizer: { enabled: true, modes: ['classic', 'hanabi'], seed: 'shared', initialSongKey: 'qq:A' },
    lyrics: { lines: [] } } as unknown as ObsBrowserSourceConfig;
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('waits for a different song, chooses only eligible styles, and cannot re-randomize on seek or reconnect', () => {
    expect(resolveRearRandomVisualizer(front)).toBe(front);
    for (let i = 0; i < 30; i++) {
        const song = { ...front, playbackSongKey: `qq:${i}` };
        const chosen = resolveRearRandomVisualizer(song);
        expect(front.randomVisualizer!.modes).toContain(chosen.visualizerMode);
        expect(chosen.visualizerMode).toBe(pickSongVisualizerMode(front.randomVisualizer!.modes, song.playbackSongKey, 'shared'));
        expect(resolveRearRandomVisualizer({ ...chosen, updatedAt: Date.now() + 5000 }).visualizerMode).toBe(chosen.visualizerMode);
    }
});

it('restores independent random rules without overriding live song identity or writing front settings', () => {
    const rear = validateRearAppearance({ version: 1, mode: 'independent', profile: {
        visual: { ...front, visualizerMode: 'monet', randomVisualizer: { ...front.randomVisualizer, modes: ['hanabi'], initialSongKey: 'qq:A' } }, font: null,
    } });
    const selected = resolveRearRandomVisualizer(resolveRearStageConfig({ ...front, playbackSongKey: 'qq:B' }, rear));
    expect(selected.visualizerMode).toBe('hanabi'); expect(selected.playbackSongKey).toBe('qq:B');
    expect(front.visualizerMode).toBe('classic'); expect(front.randomVisualizer!.modes).toEqual(['classic', 'hanabi']);
    expect(rear.profile!.visual).not.toHaveProperty('playbackSongKey');
});

it('switches style from the native track while the foreground publisher is frozen, then survives late config updates', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', Object.assign(new EventTarget(), { setTimeout, clearTimeout }));
    vi.stubGlobal('Image', function () { return { set src(_value: string) {} }; });
    const state = { revision: 1, config: { ...front, randomVisualizer: { ...front.randomVisualizer, modes: ['hanabi'] } },
        clock: { currentTime: 120, duration: 120, playerState: 'PLAYING', playbackRate: 1, sentAtMs: Date.now() - 60000 },
        track: { songKey: 'qq:B', epoch: 'B#2', title: 'B', positionMs: 2000, durationMs: 100000, playing: true } };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('/lyrics') ? { state: 'ready', lines: [] } : state })));
    const config = vi.fn();
    const stop = createRearLyricsTransport(() => {}, () => {}, false).subscribe({ config, clock: vi.fn(), audio: vi.fn(), connected: vi.fn() });
    await vi.advanceTimersByTimeAsync(300);
    expect(config.mock.lastCall![0]).toMatchObject({ playbackSongKey: 'qq:B', visualizerMode: 'hanabi' });
    state.revision++;
    await vi.advanceTimersByTimeAsync(1000);
    expect(config.mock.lastCall![0]).toMatchObject({ playbackSongKey: 'qq:B', visualizerMode: 'hanabi' });
    stop();
});

it('honors the native selection receipt instead of making a second random choice',()=>{
    const config={...front,playbackSongKey:'qq:B',visualizerMode:'classic' as const,randomVisualizerSongKey:'qq:B',randomVisualizerSelectedMode:'hanabi' as const};
    expect(resolveRearRandomVisualizer(config).visualizerMode).toBe('hanabi');
    expect(resolveRearRandomVisualizer({...config,randomVisualizerSongKey:'qq:old',randomVisualizerSelectedMode:'monet'}).visualizerMode).toBe(pickSongVisualizerMode(front.randomVisualizer!.modes,'qq:B','shared'));
});

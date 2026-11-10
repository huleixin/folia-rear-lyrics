// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_VISUALIZER_MODES } from '@/types/visualizerModes';
import { SongVisualizerPolicyTracker, RANDOM_VISUALIZER_SESSION_SEED, pickSongVisualizerMode, normalizeRandomVisualizerModes, pickRandomVisualizerMode, readRandomVisualizerModes } from '@/utils/randomVisualizerModes';
import { compressConfig, decompressConfig } from '@/utils/appearanceCodec';
import { collectVisualizerTunings, applyVisualizerTuningsToSettings } from '@/components/visualizer/tuningRegistry';
import { useVisualizerSettingsStore } from '@/stores/useVisualizerSettingsStore';

// test/unit/visualizer/randomVisualizerModes.test.ts
beforeEach(() => localStorage.clear());
describe('selected random lyric styles', () => {
    it('normalizes imported ids and keeps Hanabi selectable', () => {
        expect(normalizeRandomVisualizerModes(['hanabi', 'unknown', 'hanabi', null])).toEqual(['hanabi']);
        expect(normalizeRandomVisualizerModes([])).toEqual([...BUILTIN_VISUALIZER_MODES]);
        expect(readRandomVisualizerModes()).toContain('hanabi');
        localStorage.setItem('random_visualizer_modes', '{bad');
        expect(readRandomVisualizerModes()).toEqual([...BUILTIN_VISUALIZER_MODES]);
    });
    it('selects only from the chosen pool and avoids an immediate repeat', () => {
        expect(pickRandomVisualizerMode(['classic', 'hanabi'], 'classic', () => 0)).toBe('hanabi');
        expect(pickRandomVisualizerMode(['hanabi'], 'hanabi', () => .5)).toBe('hanabi');
        expect(pickRandomVisualizerMode(['classic', 'hanabi'], 'sora', () => .99)).toBe('hanabi');
    });
    it('roundtrips the pool and Hanabi tuning through appearance export', () => {
        const state = useVisualizerSettingsStore.getState();
        state.handleSetHanabiTuning({ sparkAmount: 0.7, renderQuality: 'low' });
        const config = { visualizerMode: 'hanabi', randomVisualizerModePerSong: true, randomVisualizerModes: ['classic', 'hanabi'], visualizerTunings: collectVisualizerTunings(useVisualizerSettingsStore.getState()) };
        const restored = decompressConfig(compressConfig(config));
        expect(restored).toEqual(config);
        state.handleSetHanabiTuning({ sparkAmount: 1 });
        applyVisualizerTuningsToSettings(state, restored.visualizerTunings);
        expect(useVisualizerSettingsStore.getState().hanabiTuning).toMatchObject({ sparkAmount: 0.7, renderQuality: 'low' });
    });
    it('persists the pool without changing the current style', () => {
        const before = useVisualizerSettingsStore.getState().visualizerMode;
        useVisualizerSettingsStore.getState().handleSetRandomVisualizerModes(['hanabi']);
        expect(readRandomVisualizerModes()).toEqual(['hanabi']);
        expect(useVisualizerSettingsStore.getState().visualizerMode).toBe(before);
    });
});

it('tracks manual overrides without mistaking the automatic song transition for a manual change',()=>{
    const tracker=new SongVisualizerPolicyTracker(),modes=['classic','hanabi','monet'] as const;
    expect(tracker.update(true,[...modes],'A','classic').initialSongKey).toBe('A');
    const previous=tracker.update(true,[...modes],'B','classic');expect(previous.initialSongKey).toBe('A');
    const automatic=pickSongVisualizerMode(modes,'B',RANDOM_VISUALIZER_SESSION_SEED);
    expect(tracker.update(true,[...modes],'B',automatic).initialSongKey).toBe(automatic==='classic'?'A':'B');
    const manual=modes.find(m=>m!==automatic)!;
    expect(tracker.update(true,[...modes],'B',manual).initialSongKey).toBe('B');
    expect(tracker.update(true,[...modes],'C',manual).initialSongKey).toBe('B');
});

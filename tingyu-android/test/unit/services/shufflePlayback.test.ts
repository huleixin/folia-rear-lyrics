import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShufflePlayback, shufflePlayback } from '@/services/shufflePlayback';
import type { SongResult } from '@/types';
import { getPlaybackSongKey } from '@/utils/appPlaybackGuards';

// test/unit/services/shufflePlayback.test.ts
const song = (id: number): SongResult => ({ id, name: `Track ${id}`, artists: [], album: { id: 0, name: '' }, durationMs: 120000,
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: String(id) } });
const queue = [1, 2, 3, 4, 5].map(song);
afterEach(() => { shufflePlayback.setEnabled(false); shufflePlayback.setSuspended(false); vi.unstubAllGlobals(); });
describe('shuffle sequence', () => {
    it('keeps peeks stable, plays every remaining track once and never edits the queue', () => {
        const sequence = createShufflePlayback(() => .2); sequence.setEnabled(true);
        let current = queue[2]; sequence.observe(queue, current);
        const original = [...queue]; const played = [current.id];
        for (let i = 0; i < 4; i++) {
            const next = sequence.next(queue, current)!;
            expect(sequence.next(queue, current)).toBe(next);
            expect(next).not.toBe(current);
            current = next; played.push(current.id); sequence.observe(queue, current);
        }
        expect(new Set(played).size).toBe(5);
        expect(queue).toEqual(original);
        expect(sequence.next(queue, current)).not.toBe(current);
    });
    it('previous follows actual history, then next retraces forward history', () => {
        const sequence = createShufflePlayback(() => .4); sequence.setEnabled(true);
        sequence.observe(queue, queue[0]);
        expect(sequence.previous(queue, queue[0])).toBeNull();
        const second = sequence.next(queue, queue[0])!; sequence.observe(queue, second);
        const third = sequence.next(queue, second)!; sequence.observe(queue, third);
        expect(sequence.previous(queue, third, true)).toBe(second);
        sequence.observe(queue, second);
        expect(sequence.next(queue, second)).toBe(third);
        sequence.observe(queue, third);
        expect(sequence.previous(queue, third)).toBe(second);
    });
    it('does not rewind history when a transition preview reads an outgoing song', () => {
        const sequence = createShufflePlayback(() => .4); sequence.setEnabled(true);
        sequence.observe(queue, queue[0]);
        const second = sequence.next(queue, queue[0])!; sequence.observe(queue, second);
        expect(sequence.next(queue, queue[0])).toBe(second);
        expect(sequence.previous(queue, second)).toBe(queue[0]);
        expect(sequence.next(queue, second)).not.toBe(second);
    });
    it('handles queue replacement, same-identity metadata updates and a single song', () => {
        const sequence = createShufflePlayback(() => .1); sequence.setEnabled(true);
        sequence.observe(queue, queue[0]);
        const next = sequence.next(queue, queue[0])!;
        const refreshed = queue.map(item => ({ ...item, name: `${item.name}!` }));
        sequence.observe(refreshed, refreshed[0]);
        expect(getPlaybackSongKey(sequence.next(refreshed, refreshed[0])!)).toBe(getPlaybackSongKey(next));
        const single = [song(99)]; sequence.observe(single, single[0]);
        expect(sequence.next(single, single[0])).toBe(single[0]);
        expect(sequence.previous(single, single[0])).toBeNull();
        expect(sequence.next([], single[0])).toBeNull();
    });
    it('suspends random selection for FM/external playback without losing the preference', () => {
        const sequence = createShufflePlayback(); sequence.setEnabled(true); sequence.setSuspended(true);
        expect(sequence.active()).toBe(false); expect(sequence.next(queue, queue[0])).toBeNull();
        sequence.setSuspended(false); expect(sequence.active()).toBe(true);
    });
});
it('cycles four modes, persists shuffle, and clearing it preserves the original queue', async () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    vi.stubGlobal('window', { localStorage: storage });
    vi.stubGlobal('localStorage', storage);
    const { useAudioSettingsStore } = await import('@/stores/useAudioSettingsStore');
    const state = useAudioSettingsStore.getState(); state.handleSetLoopMode('off');
    state.handleTogglePlaybackMode(); expect(useAudioSettingsStore.getState().loopMode).toBe('all');
    state.handleTogglePlaybackMode(); expect(useAudioSettingsStore.getState().loopMode).toBe('one');
    state.handleTogglePlaybackMode(); expect(useAudioSettingsStore.getState().shuffleEnabled).toBe(true);
    expect(values.get('player_shuffle_enabled')).toBe('true');
    expect(useAudioSettingsStore.getState().loopMode).toBe('all');
    vi.resetModules();
    const restored = (await import('@/stores/useAudioSettingsStore')).useAudioSettingsStore;
    expect(restored.getState().shuffleEnabled).toBe(true);
    expect(restored.getState().loopMode).toBe('all');
    restored.getState().handleSetLoopMode('off');
    state.handleTogglePlaybackMode(); expect(useAudioSettingsStore.getState().shuffleEnabled).toBe(false);
    expect(useAudioSettingsStore.getState().loopMode).toBe('off');
});

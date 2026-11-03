import { describe, expect, it, vi } from 'vitest';
import { dispatchMinimalAction, type MinimalActionHandlers } from '../../src/services/nativeMinimalPlayer';

// test/unit/nativeMinimalPlayer.test.ts
// The Compose minimal player's command half: which taps reach which existing command.
const handlers = (overrides: Partial<MinimalActionHandlers> = {}): MinimalActionHandlers & { calls: string[] } => {
    const calls: string[] = [];
    return {
        calls,
        displayedTrackKey: 'tx:1',
        publishedTrackKey: 'tx:1',
        playing: false,
        togglePlay: () => calls.push('toggle'),
        previous: () => calls.push('previous'),
        next: () => calls.push('next'),
        seek: seconds => calls.push(`seek:${seconds}`),
        toggleLoop: () => calls.push('loop'),
        openQueue: () => calls.push('queue'),
        collapse: () => calls.push('collapse'),
        like: () => calls.push('like'),
        openStage: () => calls.push('stage'),
        ...overrides,
    };
};

describe('compose minimal player actions', () => {
    it('routes the transport to the existing commands', () => {
        const h = handlers();
        expect(dispatchMinimalAction('toggle', 0, h)).toBe(true);
        expect(dispatchMinimalAction('previous', 0, h)).toBe(true);
        expect(dispatchMinimalAction('next', 0, h)).toBe(true);
        expect(dispatchMinimalAction('loop', 0, h)).toBe(true);
        expect(dispatchMinimalAction('queue', 0, h)).toBe(true);
        expect(dispatchMinimalAction('collapse', 0, h)).toBe(true);
        expect(h.calls).toEqual(['toggle', 'previous', 'next', 'loop', 'queue', 'collapse']);
    });

    it('never inverts a state the listener can already see', () => {
        const playing = handlers({ playing: true });
        dispatchMinimalAction('play', 0, playing);
        expect(playing.calls).toEqual([]);

        const paused = handlers({ playing: false });
        dispatchMinimalAction('pause', 0, paused);
        expect(paused.calls).toEqual([]);

        dispatchMinimalAction('play', 0, paused);
        expect(paused.calls).toEqual(['toggle']);
    });

    it('applies a seek to the song it was measured in', () => {
        const h = handlers();
        expect(dispatchMinimalAction('seek', 42.5, h)).toBe(true);
        expect(h.calls).toEqual(['seek:42.5']);
    });

    it('drops a seek that arrives after the track changed', () => {
        // A tap queued against the previous song must not move the new one.
        const h = handlers({ displayedTrackKey: 'tx:2', publishedTrackKey: 'tx:1' });
        expect(dispatchMinimalAction('seek', 42.5, h)).toBe(false);
        expect(h.calls).toEqual([]);
    });

    it('drops non-finite and negative seeks', () => {
        const h = handlers();
        expect(dispatchMinimalAction('seek', Number.NaN, h)).toBe(false);
        expect(dispatchMinimalAction('seek', Number.POSITIVE_INFINITY, h)).toBe(false);
        dispatchMinimalAction('seek', -9, h);
        expect(h.calls).toEqual(['seek:0']);
    });

    it('routes the header actions without touching the transport', () => {
        const h = handlers();
        expect(dispatchMinimalAction('like', 0, h)).toBe(true);
        expect(dispatchMinimalAction('openStage', 0, h)).toBe(true);
        expect(h.calls).toEqual(['like', 'stage']);
    });

    it('ignores actions it does not know', () => {
        const h = handlers();
        expect(dispatchMinimalAction('self-destruct', 0, h)).toBe(false);
        expect(h.calls).toEqual([]);
    });
});

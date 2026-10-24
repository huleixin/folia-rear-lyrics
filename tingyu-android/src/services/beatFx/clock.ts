// src/services/beatFx/clock.ts
// Upstream pure beat event data and accent gain, used by Hanabi. No analysis tasks.
export type BeatFxEventKind = 'beat' | 'downbeat';

export interface BeatFxEvent {
    /** Seconds from the start of the track. */
    t: number;
    kind: BeatFxEventKind;
    /** 0..1 how hard this beat hits; absent without accents. */
    impact?: number;
    /** Each band's share of the hit (sum 1); absent without accents. */
    tone?: { low: number; mid: number; high: number };
    /** Beats since the last downbeat (0 = the downbeat); null before the first one; absent without accents. */
    barPos?: number | null;
    /** False in a bar with no rhythm (sustained sound only): the beat fires no FX. Absent without accents. */
    rhythmic?: boolean;
}

/** A weak beat still peaks this high, so it is seen, just less. */
export const BEAT_FX_WEAK_BEAT_FLOOR = 0.35;

/**
 * How high a beat's envelopes peak: 1 without accents, else its impact over the floor, times the
 * track's dynamics scale; 0 in a bar with no rhythm. Also what the discrete effects (a ripple per
 * beat) scale by.
 */
export const resolveBeatFxAccentGain = (
    event: Pick<BeatFxEvent, 'impact' | 'rhythmic'> | null | undefined,
    trackScale: number,
): number => {
    if (event?.rhythmic === false) return 0;
    if (!event || event.impact === undefined) return trackScale;
    return (BEAT_FX_WEAK_BEAT_FLOOR + (1 - BEAT_FX_WEAK_BEAT_FLOOR) * event.impact) * trackScale;
};

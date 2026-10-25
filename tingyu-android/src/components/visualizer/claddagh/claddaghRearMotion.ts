// src/components/visualizer/claddagh/claddaghRearMotion.ts
// Keep the same glyphs continuous when the incoming ring adopts the current sentence's word offset.
export interface RearOffsetTransition {
    center: number; value: number; from: number; startedAt: number;
}
const TRANSITION_MS = 240;

export function advanceCladdaghRearOffset(previous: RearOffsetTransition | null, center: number,
    target: number, now: number): RearOffsetTransition {
    if (!previous || Math.abs(previous.center - center) > 1) {
        return { center, value: target, from: target, startedAt: now - TRANSITION_MS };
    }
    const transition = previous.center === center ? previous
        : { center, value: previous.value, from: previous.value, startedAt: now };
    const progress = Math.max(0, Math.min(1, (now - transition.startedAt) / TRANSITION_MS));
    const blend = progress * progress * (3 - 2 * progress);
    return { ...transition, value: transition.from + (target - transition.from) * blend };
}

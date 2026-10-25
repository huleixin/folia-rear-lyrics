import { describe, expect, it } from 'vitest';
import { advanceCladdaghRearOffset } from '@/components/visualizer/claddagh/claddaghRearMotion';

// test/unit/visualizer/claddaghRearMotion.test.ts
// Prevent the incoming sentence from snapping when its back-follow offset changes role.
describe('Claddagh rear sentence handoff', () => {
    it('starts at the rendered position, moves continuously, then follows the live target', () => {
        const previous = advanceCladdaghRearOffset(null, 0, 2, 1000);
        const start = advanceCladdaghRearOffset(previous, 1, -1, 1010);
        expect(start.value).toBe(previous.value);
        const middle = advanceCladdaghRearOffset(start, 1, -.8, 1130);
        expect(middle.value).toBeCloseTo(.6);
        expect(middle.startedAt).toBe(1010);
        const end = advanceCladdaghRearOffset(middle, 1, -.5, 1250);
        expect(end.value).toBe(-.5);
        expect(advanceCladdaghRearOffset(end, 1, -.4, 1266).value).toBeCloseTo(-.4);
    });
    it('initialises immediately and allows a seek across multiple sentences', () => {
        const previous = advanceCladdaghRearOffset(null, 0, 2, 1000);
        expect(previous.value).toBe(2);
        expect(advanceCladdaghRearOffset(previous, 8, -.5, 1010).value).toBe(-.5);
    });
});

import { describe, expect, it } from 'vitest';
import { nebbiaRearPaintsOwnWindow } from '../../../src/components/visualizer/nebbia/nebbiaBehind';
import { nebbiaFrameUniforms } from '../../../src/components/visualizer/nebbia/nebbiaFrameUniforms';
import { DEFAULT_NEBBIA_TUNING } from '../../../src/components/visualizer/nebbia/types';
import { NEBBIA_FIXED } from '../../../src/components/visualizer/nebbia/nebbiaConstants';

// test/unit/visualizer/nebbiaRearWindow.test.ts
// The rear lyric frame always receives a transparent background, so the window scene has to come
// from 窗外 itself; otherwise every option silently fell back to the shared wallpaper.
describe('Nebbia rear window scene', () => {
    it('keeps its own window for the rain street and the aquarium', () => {
        expect(nebbiaRearPaintsOwnWindow('night')).toBe(true);
        expect(nebbiaRearPaintsOwnWindow('aquarium')).toBe(true);
    });
    it('lets the shared background through when the window is set to 背景', () => {
        expect(nebbiaRearPaintsOwnWindow('backdrop')).toBe(false);
        expect(nebbiaRearPaintsOwnWindow(undefined)).toBe(false);
    });
    it('tightens only the rear wipe edge and leaves the front stage untouched', () => {
        const spot = { x: 0, y: 0, r: 100, i: 0 };
        const front = nebbiaFrameUniforms(DEFAULT_NEBBIA_TUNING, [0, 0], spot, 400, 300, 0, null);
        const rear = nebbiaFrameUniforms(DEFAULT_NEBBIA_TUNING, [0, 0], spot, 400, 300, 0, null, true);
        expect(front.edge).toBe(NEBBIA_FIXED.edge);
        expect(rear.edge).toBeLessThan(front.edge);
        expect(rear.mist).toBe(front.mist);
        expect(rear.scenery).toBe(front.scenery);
    });
});

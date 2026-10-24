import { afterEach, describe, expect, it, vi } from 'vitest';
import { HanabiPixiRuntime } from '@/components/visualizer/hanabi/createHanabiPixiRuntime';
import { DEFAULT_HANABI_TUNING } from '@/components/visualizer/hanabi/types';
import { FALLBACK_AI_DUAL_THEME } from '@/services/themeSanitizer';

// test/unit/visualizer/hanabi/rearRuntime.test.ts
// Run real sizing and draw dispatch with a fake GPU; no canvas/browser result is claimed.
afterEach(() => vi.unstubAllGlobals());
describe('Hanabi rear runtime', () => {
    it.each([true, false])('keeps local size, origin and sky correct (rear=%s)', rear => {
        vi.stubGlobal('document', { documentElement: { clientWidth: 400, clientHeight: 250, dataset: { foliaSurface: rear ? 'rear-lyrics-panel' : 'main' } } });
        vi.stubGlobal('window', { devicePixelRatio: 2 });
        const resize = vi.fn(), sky = vi.fn();
        const vector = () => ({ set: vi.fn() });
        const layer = () => ({ removeChildren: () => [], pivot: vector(), position: vector(), scale: vector(), filters: [] });
        const options = { host: { clientWidth: 228, clientHeight: 106 }, currentTime: { get: () => 0 },
            song: { theme: FALLBACK_AI_DUAL_THEME.dark, program: { seed: 'rear', paragraphs: [], chorus: [] } },
            tuning: { ...DEFAULT_HANABI_TUNING, overlayFrame: false, bloom: 0, chorusBloom: 0 }, metadata: {} };
        const runtime: any = new (HanabiPixiRuntime as any)({}, options, { renderer: { resize } });
        runtime.overlayLayer = layer(); runtime.sceneLayer = layer();
        runtime.credits = { holder: {}, resolveFrame: () => ({ active: false }), needsBuild: () => false, update() {} };
        runtime.sky = { update: sky };
        expect(runtime.resizeToHost(true)).toBe(true);
        expect(resize).toHaveBeenCalledWith(rear ? 228 : 320, rear ? 106 : 240, 2);
        expect(runtime.overlayLayer.x).toBe(0);
        expect(runtime.credits.holder.x).toBe(0);
        expect(runtime.resizeToHost(true)).toBe(false);
        runtime.rebuildDue = false;
        runtime.renderFrame();
        expect(sky.mock.calls[0][1]).toBe(rear ? 0 : DEFAULT_HANABI_TUNING.sky);
        expect(runtime.sceneLayer.position.set).toHaveBeenCalledWith(rear ? 114 : 160, rear ? 53 : 120);
        expect(runtime.sceneLayer.scale.set).toHaveBeenCalledWith(1);
    });
});

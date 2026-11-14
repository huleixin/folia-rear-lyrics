import { test, expect } from './fixtures';
import { rearStageConfig } from './rearStageFixture';

// test/component/stageWebViewCompatibility.spec.ts
test.use({ viewport: { width: 1000, height: 650 } });
for (const mode of ['fume', 'tilt', 'pendolo'] as const) {
    test(`${mode} renders lyrics without native Intl.Segmenter`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => {
            Object.defineProperty(Intl, 'Segmenter', { value: undefined, writable: true, configurable: true });
            const painted: string[] = [];
            (window as any).__paintedLyrics = painted;
            const fillText = CanvasRenderingContext2D.prototype.fillText;
            CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
                painted.push(text);
                return fillText.call(this, text, ...args);
            };
        });
        await page.route('**/__folia_rear/state*', route => route.fulfill({ json: { revision: 1, config: rearStageConfig(mode),
            clock: { currentTime: 40, duration: 213, sentAtMs: Date.now(), playbackRate: 1, playerState: 'PAUSED' },
        } }));
        await page.goto('/rear-lyrics.html?layer=lyrics');
        const stage = page.locator(`[data-visualizer-mode="${mode}"]`);
        await expect(stage).toBeVisible();
        await expect.poll(() => page.evaluate(canvasOnly => (window as any).__paintedLyrics.join('').includes('风吹过听屿')
            || (!canvasOnly && document.body.textContent!.includes('风吹过听屿')), mode === 'fume')).toBe(true);
        expect(errors).toEqual([]);
    });
}

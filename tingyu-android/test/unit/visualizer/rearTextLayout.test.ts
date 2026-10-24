import { afterEach, describe, expect, it, vi } from 'vitest';
import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext';
import { rearLyricFont, rearSubtitleFont } from '@/components/visualizer/rearTextLayout';
import { getVisualizerSurface } from '@/utils/visualizerSurface';
import { FALLBACK_AI_DUAL_THEME } from '@/services/themeSanitizer';
import { resolveThemeFontStack, resolveThemeFontWeight } from '@/utils/fontStacks';
import { installFakeTextMeasure } from './lumiere/lumiereFixtures';

// test/unit/visualizer/rearTextLayout.test.ts
// Real pretext line breaking with deterministic glyph metrics, not a GPU screenshot test.
installFakeTextMeasure();
afterEach(() => vi.unstubAllGlobals());
describe('rear typography', () => {
    it.each(['现在已经回不去了', '爸妈又一起走过的老街', 'Send them your heart so they will know someone cares', 'それが大事 ここに無いものを信じる'])('wraps the whole lyric legibly inside the body: %s', text => {
        vi.stubGlobal('document', { documentElement: { clientWidth: 556, clientHeight: 352, dataset: { foliaSurface: 'rear-lyrics-panel' } } });
        const surface = getVisualizerSurface()!; const theme = FALLBACK_AI_DUAL_THEME.dark;
        const px = rearLyricFont(text, theme)!;
        const measured = layoutWithLines(prepareWithSegments(text, `${resolveThemeFontWeight(theme, 700)} ${px}px ${resolveThemeFontStack(theme)}`), surface.width * .84, px * 1.45);
        expect(px).toBeGreaterThanOrEqual(16);
        expect(measured.lines.length * px * 1.45).toBeLessThanOrEqual(surface.lyricHeight * .72 + 1);
        expect(measured.lines.every(line => line.width <= surface.width * .84 + 1)).toBe(true);
    });
    it('fits translation and romanization together above the controls', () => {
        vi.stubGlobal('document', { documentElement: { clientWidth: 556, clientHeight: 352, dataset: { foliaSurface: 'rear-lyrics-panel' } } });
        const surface = getVisualizerSurface()!, theme = FALLBACK_AI_DUAL_THEME.dark;
        const texts = ['爸妈又一起走过的老街', 'Ba ma you yi qi zou guo de lao jie'];
        const px = rearSubtitleFont(texts, theme)!;
        const font = `${resolveThemeFontWeight(theme, 500)} ${px}px ${resolveThemeFontStack(theme)}`;
        const height = texts.reduce((sum, text) => sum + layoutWithLines(prepareWithSegments(text, font), surface.width - 24, px * 1.3).lines.length * px * 1.3, 0) + 3;
        expect(px).toBeGreaterThanOrEqual(12);
        expect(height).toBeLessThanOrEqual(surface.subtitleHeight - 4);
    });
    it('leaves front-stage font calculation alone', () => {
        vi.stubGlobal('document', { documentElement: { dataset: {} } });
        expect(rearLyricFont('We are the world', FALLBACK_AI_DUAL_THEME.dark)).toBeNull();
    });
});

import type { Line } from '../../../types';
import type { RearRect } from '../../../utils/rearCameraSafeArea';
import { measureMonetLineLayout, type MonetLineLayoutInputs } from './monetLyricsModel';

// src/components/visualizer/monet/monetRearLayout.ts
// Constrain the spring's position instead of clipping the sung block as it enters.
export function clampMonetRearLineY(y: number, scale: number, blockHeight: number, railHeight: number) {
    return Math.max(3, Math.min(y, railHeight - blockHeight * scale - 3));
}

// Measure the sung block at the rear panel's real width, before the rail animates.
export function resolveMonetRearTypography(line: Line | undefined, safe: RearRect, fontScale: number,
    subtitleScale: number, fonts: Omit<MonetLineLayoutInputs, 'fontPx' | 'translationFontPx' | 'maxWidthPx'>) {
    let fontPx = Math.max(18, Math.min(24, safe.height * .105)) * fontScale;
    let translationFontPx = fontPx * .58 * subtitleScale;
    for (let attempt = 0; line && attempt < 8; attempt++) {
        const layout = measureMonetLineLayout({ line, status: 'active', ...fonts,
            fontPx, translationFontPx, maxWidthPx: safe.width - 8 });
        const height = layout.textLineCount * layout.lineHeightPx + layout.textPaddingTopPx
            + layout.textPaddingBottomPx + layout.translationHeightPx;
        if (height <= safe.height * .8 && !layout.isTextOverflowingWidth) break;
        const scale = Math.max(.5, Math.min(.9, safe.height * .78 / height));
        fontPx *= scale;
        translationFontPx *= scale;
    }
    return { lyricFontPx: fontPx, inactiveFontPx: fontPx * .78, translationFontPx };
}

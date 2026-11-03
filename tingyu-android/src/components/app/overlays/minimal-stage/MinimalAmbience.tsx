import React from 'react';
import { hslToRgb, rgbToHsl, rgbCss, type MinimalPalette } from './minimalPalette';
import { parseColorChannels } from '../../../visualizer/colorMix';
import './minimalAmbience.css';

// src/components/app/overlays/minimal-stage/MinimalAmbience.tsx
// Adapt the supplied AuroraBgView's three cover-derived radial glows to cached CSS layers.
// No native animator, Canvas repaint loop, FFT or per-frame React updates are needed.
export const minimalAuroraGlow = (color: string) => {
    const rgb = parseColorChannels(color);
    if (!rgb) return color;
    const hsl = rgbToHsl(rgb);
    return rgbCss(hslToRgb({ ...hsl, s: Math.min(.72, Math.max(.42, hsl.s * 1.2)), l: .62 }));
};

export default function MinimalAmbience({
    palette,
    paused,
    still,
}: {
    palette: MinimalPalette;
    /** Paused, backgrounded or occluded: stop the compositor animations. */
    paused: boolean;
    /** Reduced motion: keep the colours, drop the movement. */
    still: boolean;
}) {
    // Colors change only with cover/theme; only layer transforms animate.
    const vars = {
        '--min-base': palette.base,
        '--min-field-1': palette.fieldPrimary,
        '--min-field-2': palette.fieldSecondary,
        '--min-bloom': palette.bloom,
        '--min-accent': palette.accent,
        '--aurora-a': minimalAuroraGlow(palette.fieldPrimary),
        '--aurora-b': minimalAuroraGlow(palette.fieldSecondary),
        '--aurora-c': minimalAuroraGlow(palette.bloom),
    } as React.CSSProperties;
    return (
        <div
            className="min-amb"
            style={vars}
            aria-hidden="true"
            data-paused={paused || undefined}
            data-still={still || undefined}
            data-derived={palette.derived || undefined}
        >
            <span className="min-amb__wash" />
            <span className="min-amb__blob min-amb__blob--a" />
            <span className="min-amb__blob min-amb__blob--b" />
            <span className="min-amb__blob min-amb__blob--c" />
            <span className="min-amb__veil" />
            <span className="min-amb__vignette" />
        </div>
    );
}

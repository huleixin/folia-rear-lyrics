import React from 'react';
import type { MinimalPalette } from './minimalPalette';

// src/components/app/overlays/minimal-stage/MinimalAmbience.tsx
// Seven flat layers, no shader, no blur filter, no canvas.
//
// Why gradients instead of the usual "blur huge circles" recipe: a `filter: blur(80px)`, a backdrop
// filter, or a Shader each cost a full-screen pass on every frame they are composited. Large soft
// radial gradients are already smooth, so the whole background is one paint that the compositor can
// then move with `transform` alone — which is exactly what the slow drift does below.
//
// The drift is deliberately slow (40–60s) and gated three ways: by the player state, by the page's
// visibility, and by the listener's motion preference. Nothing here runs at frame rate in JS.

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
    // The palette is published here as well as on the shell, and it is this copy that the 700ms
    // crossfade runs on (see the transition on .min-amb). A custom property set on the shell is
    // inherited by the whole page, so animating it there re-resolved every lyric span on every
    // frame of the fade; on this box the same fade touches the eight spans that paint it.
    const vars = {
        '--min-base': palette.base,
        '--min-field-1': palette.fieldPrimary,
        '--min-field-2': palette.fieldSecondary,
        '--min-bloom': palette.bloom,
        '--min-accent': palette.accent,
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
            <span className="min-amb__bloom" />
            <span className="min-amb__veil" />
            <span className="min-amb__vignette" />
            {/* A single 120px noise tile, painted once. It is the difference between a gradient and
                a printed surface; it never repaints, so it costs one texture and nothing per frame. */}
            <span className="min-amb__grain" />
        </div>
    );
}

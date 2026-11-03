import React from 'react';
import type { MinimalPalette } from './minimalPalette';

// src/components/app/overlays/minimal-stage/MinimalAmbience.tsx
// Four flat layers, no shader, no blur filter, no canvas.
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
    return (
        <div
            className="min-amb"
            aria-hidden="true"
            data-paused={paused || undefined}
            data-still={still || undefined}
            data-derived={palette.derived || undefined}
        >
            <span className="min-amb__wash" />
            <span className="min-amb__field min-amb__field--a" />
            <span className="min-amb__field min-amb__field--b" />
            <span className="min-amb__bloom" />
            <span className="min-amb__veil" />
        </div>
    );
}

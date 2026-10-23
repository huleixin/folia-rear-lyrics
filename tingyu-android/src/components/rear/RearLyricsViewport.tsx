import React, { forwardRef } from 'react';
import type { RearViewport } from '../../utils/rearViewport';

// src/components/rear/RearLyricsViewport.tsx
// Camera avoidance is a layout constraint inside a full-screen frame, not a clipping edge.
const RearLyricsViewport = forwardRef<HTMLIFrameElement, { viewport: RearViewport }>(({ viewport }, ref) =>
    <iframe ref={ref} title="Folia camera-safe lyrics" src="/rear-lyrics.html?layer=lyrics"
        style={{ position: 'absolute', zIndex: 1, ...viewport, border: 0, background: 'transparent' }} />);
RearLyricsViewport.displayName = 'RearLyricsViewport';
export default RearLyricsViewport;

import React, { forwardRef } from 'react';
import type { RearViewport } from '../../utils/rearViewport';
import { rearLyricsFrameUrl } from '../../utils/rearLyricsFrameUrl';

const stageUrl = rearLyricsFrameUrl(window.location.search);

// src/components/rear/RearLyricsViewport.tsx
// Camera avoidance is a layout constraint inside a full-screen frame, not a clipping edge.
const RearLyricsViewport = forwardRef<HTMLIFrameElement, { viewport: RearViewport;onLoad?:()=>void }>(({ viewport,onLoad }, ref) =>
    <iframe onLoad={onLoad} ref={ref} title="Folia camera-safe lyrics" src={stageUrl}
        style={{ position: 'absolute', zIndex: 1, ...viewport, border: 0, background: 'transparent' }} />);
RearLyricsViewport.displayName = 'RearLyricsViewport';
export default RearLyricsViewport;

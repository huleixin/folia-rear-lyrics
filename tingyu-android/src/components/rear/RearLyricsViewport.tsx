import React, { forwardRef } from 'react';
import type { RearViewport } from '../../utils/rearViewport';

const params = new URLSearchParams(window.location.search);
const nativeQuery = params.get('nativeCard') === '1' ? '&nativeCard=1' + (Number(params.get('prepareUntil')) > 0 ? '&prepareUntil=' + Number(params.get('prepareUntil')) : '') : '';

// src/components/rear/RearLyricsViewport.tsx
// Camera avoidance is a layout constraint inside a full-screen frame, not a clipping edge.
const RearLyricsViewport = forwardRef<HTMLIFrameElement, { viewport: RearViewport;onLoad?:()=>void }>(({ viewport,onLoad }, ref) =>
    <iframe onLoad={onLoad} ref={ref} title="Folia camera-safe lyrics" src={'/rear-lyrics.html?layer=lyrics' + nativeQuery}
        style={{ position: 'absolute', zIndex: 1, ...viewport, border: 0, background: 'transparent' }} />);
RearLyricsViewport.displayName = 'RearLyricsViewport';
export default RearLyricsViewport;

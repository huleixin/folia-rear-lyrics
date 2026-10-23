import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMotionValue } from 'framer-motion';
import VisualizerBackgroundRenderer from '../visualizer/backgrounds/VisualizerBackgroundRenderer';
import { createRearLyricsTransport } from '../../services/rearLyricsTransport';
import { getSizedCoverUrl } from '../../utils/coverUrl';
import { PlayerState } from '../../types';
import type { ObsBrowserSourceConfig } from '../../types/obsBrowserSource';
import RearLyricsViewport from './RearLyricsViewport';
import { useRearViewport } from '../../hooks/useRearViewport';

// src/components/rear/RearLyricsSurface.tsx
// Full-panel wallpaper and a separate, transparent lyric viewport share the published Folia settings.
export default function RearLyricsSurface() {
    const panel = useRef<HTMLIFrameElement>(null);
    const viewport = useRearViewport();
    const [config, setConfig] = useState<ObsBrowserSourceConfig | null>(null);
    const [paused, setPaused] = useState(true);
    const [sleeping, setSleeping] = useState(false);
    const audioPower = useMotionValue(0);
    const bass = useMotionValue(0), lowMid = useMotionValue(0), mid = useMotionValue(0);
    const vocal = useMotionValue(0), treble = useMotionValue(0);
    const spectrum = useMotionValue(new Uint8Array(0));
    const audioBands = useMemo(() => ({ bass, lowMid, mid, vocal, treble, spectrum }), [bass, lowMid, mid, vocal, treble, spectrum]);
    const reveal = useCallback(() => {
        panel.current?.contentWindow?.dispatchEvent(new Event('folia-rear-reveal'));
    }, []);
    useEffect(() => {
        document.title = 'Folia Rear Lyrics';
        document.documentElement.dataset.foliaSurface = 'rear-lyrics';
        const transport = createRearLyricsTransport(() => undefined, () => undefined, false);
        const unsubscribe = transport.subscribe({
            config: setConfig,
            clock: value => setPaused(value.playerState !== PlayerState.PLAYING),
            connected: () => undefined,
            audio: value => {
                audioPower.set(value.audioPower);
                bass.set(value.bands.bass); lowMid.set(value.bands.lowMid); mid.set(value.bands.mid);
                vocal.set(value.bands.vocal); treble.set(value.bands.treble);
                spectrum.set(new Uint8Array(value.spectrum));
            },
        });
        window.addEventListener('folia-rear-reveal', reveal);
        const power = (event: Event) => {
            const detail = (event as CustomEvent<{ sleeping: boolean }>).detail;
            setSleeping(detail?.sleeping === true);
            const frame = panel.current?.contentWindow;
            if (frame) frame.dispatchEvent(new CustomEvent('folia-rear-power', { detail }));
        };
        window.addEventListener('folia-rear-power', power);
        return () => { unsubscribe(); window.removeEventListener('folia-rear-reveal', reveal); window.removeEventListener('folia-rear-power', power); };
    }, [audioPower, audioBands, bass, lowMid, mid, vocal, treble, spectrum, reveal]);
    return <main data-testid="rear-lyrics-surface" onPointerDownCapture={reveal}
        style={{ position: 'fixed', inset: 0, overflow: 'hidden', touchAction: 'none', userSelect: 'none', background: config?.theme.backgroundColor ?? '#09090b' }}>
        <div data-testid="rear-wallpaper" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: config?.visualizerOpacity ?? 1 }}>
            {config && <VisualizerBackgroundRenderer config={config.background} theme={config.theme}
                isDaylight={config.isDaylight} coverUrl={getSizedCoverUrl(config.coverUrl, 1024)}
                audioPower={audioPower} audioBands={audioBands} seed={config.seed} staticMode={config.staticMode} paused={paused || sleeping} />}
        </div>
        <RearLyricsViewport ref={panel} viewport={viewport} />
    </main>;
}

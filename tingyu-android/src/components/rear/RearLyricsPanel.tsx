import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ObsBrowserSourceApp from '../obs/ObsBrowserSourceApp';
import { createRearLyricsTransport } from '../../services/rearLyricsTransport';
import type { ObsBrowserSourceClock } from '../../types/obsBrowserSource';
import { PlayerState, type Theme } from '../../types';
import { SkipBack, SkipForward, Play, Pause } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { subscribeRearStateRelay } from '../../services/rearStateRelay';

// src/components/rear/RearLyricsPanel.tsx
// The renderer lays out on the right, but its transitions paint across the full rear iframe.
export default function RearLyricsPanel() {
    const { t } = useTranslation();
    const [playing, setPlaying] = useState(false);
    const playingRef = useRef(false);
    const [sending, setSending] = useState(false);
    const [controlFailed, setControlFailed] = useState(false);
    const clock = useRef<ObsBrowserSourceClock | null>(null);
    const bar = useRef<HTMLDivElement>(null), elapsedText = useRef<HTMLSpanElement>(null), durationText = useRef<HTMLSpanElement>(null);
    const hideTimer = useRef(0);
    const [progressVisible, setProgressVisible] = useState(true);
    const [theme, setTheme] = useState<Theme | null>(null);
    const transport = useMemo(() => {
        const source = createRearLyricsTransport(value => {
            clock.current = value;
            const next = value.playerState === PlayerState.PLAYING;
            if (next !== playingRef.current) { playingRef.current = next; setPlaying(next); }
        }, config => setTheme(config.theme), true, {
            receiveSnapshots: window.parent !== window ? subscribeRearStateRelay : undefined,
        });
        return { subscribe: (events: Parameters<typeof source.subscribe>[0]) => source.subscribe({ ...events,
            // The outer document draws the selected background once across the whole rear panel.
            config: config => events.config({ ...config, background: { ...config.background, transparent: true } }),
        }) };
    }, []);
    const control = async (action: 'previous' | 'play' | 'pause' | 'next') => {
        if (sending) return;
        setSending(true); setControlFailed(false); reveal();
        try {
            const result = await fetch(`/__folia_rear/control?action=${action}`, { method: 'POST', cache: 'no-store' });
            if (!result.ok) throw new Error('Rear control unavailable');
        } catch { setControlFailed(true); }
        finally { window.setTimeout(() => setSending(false), 250); }
    };
    const reveal = useCallback(() => {
        setProgressVisible(true); clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => setProgressVisible(false), 2500);
    }, []);
    const configured = useCallback(() => {
        void fetch('/__folia_rear/ready', { cache: 'no-store' }).catch(() => undefined);
    }, []);
    useEffect(() => {
        document.title = 'Folia Rear Lyrics';
        document.documentElement.dataset.foliaSurface = 'rear-lyrics-panel';
        window.addEventListener('folia-rear-reveal', reveal);
        reveal();
        return () => { clearTimeout(hideTimer.current); window.removeEventListener('folia-rear-reveal', reveal); };
    }, [reveal]);
    useEffect(() => {
        if (!progressVisible) return;
        let frame = 0;
        const format = (time: number) => `${Math.floor(time / 60).toString().padStart(2, '0')}:${Math.floor(time % 60).toString().padStart(2, '0')}`;
        const update = () => {
            const value = clock.current;
            if (value) {
                const advance = value.playerState === PlayerState.PLAYING ? Math.max(0, Date.now() - value.sentAtMs) / 1000 * value.playbackRate : 0;
                const elapsed = Math.min(value.duration || Infinity, Math.max(0, value.currentTime + advance));
                if (bar.current) bar.current.style.transform = `scaleX(${value.duration > 0 ? Math.min(1, elapsed / value.duration) : 0})`;
                if (elapsedText.current) elapsedText.current.textContent = format(elapsed);
                if (durationText.current) durationText.current.textContent = format(value.duration);
            }
            frame = requestAnimationFrame(update);
        };
        frame = requestAnimationFrame(update);
        return () => cancelAnimationFrame(frame);
    }, [progressVisible]);
    return <main data-testid="rear-lyrics-panel" onPointerDownCapture={reveal}
        style={{ position: 'fixed', inset: 0, overflow: 'hidden', touchAction: 'none', userSelect: 'none', background: 'transparent' }}>
        <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
            <ObsBrowserSourceApp transport={transport} onConfigured={configured} />
        </div>
        <div data-testid="rear-progress" aria-hidden={!progressVisible}
            style={{ position: 'absolute', left: '40.6%', right: '6.6%', bottom: 'max(18px, 8%)', opacity: progressVisible ? 1 : 0,
                transition: 'opacity 180ms', pointerEvents: progressVisible ? 'auto' : 'none', color: theme?.primaryColor ?? '#eee' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 7 }}>
                {([
                    ['previous', SkipBack, t('ui.previousTrack')], [playing ? 'pause' : 'play', playing ? Pause : Play, playing ? t('mobileLibrary.pause') : t('mobileLibrary.play')],
                    ['next', SkipForward, t('ui.nextTrack')],
                ] as const).map(([action, Icon, label]) => <button key={action} aria-label={label} disabled={sending} tabIndex={progressVisible ? 0 : -1}
                    onClick={() => void control(action)} style={{ width: 32, height: 30, display: 'grid', placeItems: 'center', border: 0, borderRadius: 20, color: 'inherit', background: '#0003' }}>
                    <Icon size={17} fill="currentColor" />
                </button>)}
            </div>
            {controlFailed && <span role="status" style={{ fontSize: 9 }}>{t('search.error')}</span>}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 'clamp(10px, 2.8vmin, 16px)', fontVariantNumeric: 'tabular-nums' }}>
                <span ref={elapsedText}>00:00</span><span ref={durationText}>00:00</span>
            </div>
            <div style={{ height: 4, borderRadius: 8, background: 'currentColor', opacity: .25 }} />
            <div ref={bar} style={{ position: 'absolute', bottom: 0, width: '100%', height: 4, borderRadius: 8, background: 'currentColor', transformOrigin: 'left', transform: 'scaleX(0)' }} />
        </div>
    </main>;
}

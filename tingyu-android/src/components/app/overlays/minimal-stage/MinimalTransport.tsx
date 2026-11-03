import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoaderCircle, ListMusic, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import ProgressBar from '../../../ProgressBar';
import type { AppOverlaysModel } from '../buildAppOverlaysModel';
import { PlayerState } from '../../../../types';
import { openNativeQueueSheet } from '../../../../services/nativeMinimalQueue';
import { useAppViewStore } from '../../../../stores/useAppViewStore';
import './minimalProgressGlow.css';
import { playbackModeLabelKey, resolvePlaybackMode } from '../../../../utils/playbackMode';

// src/components/app/overlays/minimal-stage/MinimalTransport.tsx
// One transport, shared by both minimal pages — the design shows the same bar on each.
//
// The row is mode / previous / play-pause / next / queue, the same five slots the classic stage's
// control bar has. It used to be shuffle and repeat as two separate buttons, which is two controls
// for one question: both could look "on" at once, and neither showed the mode the listener was
// actually in. There is one button now, and it steps order → all → one → shuffle.
//
// Everything here is a command that already exists:
//   · seek / play / previous / next come from the floating-controls model, which is the same object
//     the classic stage chrome consumes;
//   · the mode comes from that model too — `controls.shuffleEnabled` / `controls.loopMode` /
//     `controls.onToggleLoop` — and not from the store directly. That matters: the model masks
//     shuffle where it does not apply, so reading it is what guarantees the two views agree rather
//     than each having its own idea of the current mode.
// The progress bar is the app's shared ProgressBar: same MotionValue clock, same drag ownership, so
// a seek started on the minimal page cannot disagree with one started on the stage.

type Controls = NonNullable<AppOverlaysModel['floatingControls']>;

/** How long the mode name stays next to the transport after a switch. */
const MODE_HINT_MS = 1500;

export default function MinimalTransport({ controls, active = true }: { controls: Controls; active?: boolean }) {
    const { t } = useTranslation();
    const disabled = !!controls.controlsDisabled;
    const playing = controls.playerState === PlayerState.PLAYING;
    const preparing = !!controls.preparing;
    const canPlay = !disabled && controls.canTogglePlay;
    const [seeking, setSeeking] = useState(false);
    useEffect(() => { if (!active || disabled) setSeeking(false); }, [active, disabled]);
    const navigation = controls.trackNavigation;
    const mode = resolvePlaybackMode(controls.shuffleEnabled, controls.loopMode);
    const [hint, setHint] = useState<{ key: number; text: string } | null>(null);
    const hintTimer = useRef(0);
    const shownMode = useRef(mode);

    // The name is read back from the state that actually changed, not from the button that was
    // pressed: the action is the model's, and in a context where it refuses to switch (the stage owns
    // playback, FM) the leaf should stay silent instead of claiming a mode that did not happen.
    useEffect(() => {
        if (mode === shownMode.current) {
            return;
        }
        shownMode.current = mode;
        setHint({ key: Date.now(), text: t(playbackModeLabelKey(mode)) });
        window.clearTimeout(hintTimer.current);
        hintTimer.current = window.setTimeout(() => setHint(null), MODE_HINT_MS);
    }, [mode, t]);

    useEffect(() => () => window.clearTimeout(hintTimer.current), []);

    const openQueue = useCallback(() => {
        const state = useAppViewStore.getState();
        void openNativeQueueSheet().then(handled => { if (!handled) { state.setPanelTab('queue'); state.setIsPanelOpen(true); } });
    }, []);

    const ModeIcon = mode === 'shuffle' ? Shuffle : mode === 'one' ? Repeat1 : Repeat;
    const modeName = t(playbackModeLabelKey(mode));

    return (
        <section className="min-transport" aria-label={t('mobileStage.playback')} data-disabled={disabled || undefined} data-render-active={active || undefined} data-live={playing && active && !disabled || undefined} data-seeking={seeking || undefined}>
            <div className="min-seek">
                <ProgressBar
                    renderActive={active}
                    onSeekStart={() => setSeeking(true)}
                    onSeekEnd={() => setSeeking(false)}
                    currentTime={controls.currentTime}
                    duration={controls.duration}
                    onSeek={controls.onSeek}
                    primaryColor="var(--min-fill)"
                    secondaryColor="var(--min-muted)"
                    trackColor="var(--min-track)"
                    disabled={disabled || controls.duration <= 0}
                    ariaLabel={t('mobileStage.seek')}
                />
            </div>
            <div className="min-buttons">
                <button
                    type="button"
                    className="min-btn min-btn--aux"
                    aria-label={`${t('mobileStage.loop')}：${modeName}`}
                    aria-pressed={mode !== 'order'}
                    title={modeName}
                    data-mode={mode}
                    data-active={mode !== 'order' || undefined}
                    disabled={disabled}
                    onClick={() => controls.onToggleLoop()}
                    data-testid="minimal-playback-mode"
                >
                    <ModeIcon size={20} strokeWidth={1.9} />
                </button>
                <button
                    type="button"
                    className="min-btn"
                    aria-label={navigation?.prevLabel || t('ui.previousTrack')}
                    disabled={disabled || !navigation?.canPrev}
                    onClick={navigation?.onPrev}
                >
                    <SkipBack size={24} strokeWidth={1.9} />
                </button>
                <button
                    type="button"
                    className="min-btn min-btn--play"
                    aria-label={t(preparing && !canPlay ? 'mobileLibrary.loading' : playing ? 'mobileLibrary.pause' : 'mobileLibrary.play')}
                    aria-pressed={playing}
                    disabled={!canPlay}
                    aria-busy={preparing || undefined}
                    onClick={controls.onTogglePlay}
                >
                    <span className="min-play-ring" aria-hidden="true" />
                    {preparing && !canPlay && <LoaderCircle className="min-play-loading" size={24} aria-hidden="true" />}
                    <span className="min-play-glyph" aria-hidden="true" style={{visibility:preparing && !canPlay ? 'hidden' : undefined}}>
                        <Pause
                            className="min-play-icon"
                            data-slot="pause"
                            data-on={playing ? '' : undefined}
                            size={26}
                            strokeWidth={0}
                            fill="currentColor"
                        />
                        <Play
                            className="min-play-icon"
                            data-slot="play"
                            data-on={playing ? undefined : ''}
                            size={26}
                            strokeWidth={0}
                            fill="currentColor"
                        />
                    </span>
                </button>
                <button
                    type="button"
                    className="min-btn"
                    aria-label={navigation?.nextLabel || t('ui.nextTrack')}
                    disabled={disabled || !navigation?.canNext}
                    onClick={navigation?.onNext}
                >
                    <SkipForward size={24} strokeWidth={1.9} />
                </button>
                <button
                    type="button"
                    className="min-btn min-btn--aux"
                    aria-label={t('mobileStage.queue')}
                    onClick={openQueue}
                    data-testid="minimal-queue"
                >
                    <ListMusic size={21} strokeWidth={1.9} />
                </button>
                {/* Small, local, and gone in a second and a half: the mode name belongs next to the
                    button that changed it, not in a pill at the top of the screen over a lyric. */}
                {hint && (
                    <span key={hint.key} className="min-mode-hint" role="status" aria-live="polite">
                        {hint.text}
                    </span>
                )}
            </div>
        </section>
    );
}

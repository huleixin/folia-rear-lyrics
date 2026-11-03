import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import ProgressBar from '../../../ProgressBar';
import type { AppOverlaysModel } from '../buildAppOverlaysModel';
import { PlayerState } from '../../../../types';
import { useAudioSettingsStore } from '../../../../stores/useAudioSettingsStore';

// src/components/app/overlays/minimal-stage/MinimalTransport.tsx
// One transport, shared by both minimal pages — the design shows the same bar on each.
//
// Everything here is a command that already exists:
//   · seek / play / previous / next come from the floating-controls model, which is the same object
//     the classic stage chrome consumes;
//   · loop and shuffle are the audio-settings store's own actions, the pair every other surface
//     calls. Nothing in this file decides what a mode means.
// The progress bar is the app's shared ProgressBar: same MotionValue clock, same drag ownership, so
// a seek started on the minimal page cannot disagree with one started on the stage.

type Controls = NonNullable<AppOverlaysModel['floatingControls']>;

export default function MinimalTransport({ controls }: { controls: Controls }) {
    const { t } = useTranslation();
    const shuffle = useAudioSettingsStore(state => state.shuffleEnabled);
    const loopMode = useAudioSettingsStore(state => state.loopMode);
    const disabled = !!controls.controlsDisabled;
    const playing = controls.playerState === PlayerState.PLAYING;
    const canPlay = !disabled && controls.canTogglePlay;
    const navigation = controls.trackNavigation;

    return (
        <section className="min-transport" aria-label={t('mobileStage.playback')} data-disabled={disabled || undefined}>
            <div className="min-seek">
                <ProgressBar
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
                    aria-label={t('mobileStage.loop_shuffle')}
                    aria-pressed={shuffle}
                    data-active={shuffle || undefined}
                    disabled={disabled}
                    onClick={() => useAudioSettingsStore.getState().handleSetShuffleEnabled(!shuffle)}
                >
                    <Shuffle size={20} strokeWidth={1.9} />
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
                    aria-label={t(playing ? 'mobileLibrary.pause' : 'mobileLibrary.play')}
                    aria-pressed={playing}
                    disabled={!canPlay}
                    onClick={controls.onTogglePlay}
                >
                    <span className="min-play-ring" aria-hidden="true" />
                    <span className="min-play-glyph" aria-hidden="true">
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
                    aria-label={t('mobileStage.loop')}
                    aria-pressed={loopMode !== 'off'}
                    data-active={loopMode !== 'off' || undefined}
                    disabled={disabled}
                    onClick={() => useAudioSettingsStore.getState().handleToggleLoopMode()}
                >
                    {loopMode === 'one'
                        ? <Repeat1 size={20} strokeWidth={1.9} />
                        : <Repeat size={20} strokeWidth={1.9} />}
                </button>
            </div>
        </section>
    );
}

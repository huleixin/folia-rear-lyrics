import React, { useCallback, useRef, useState } from 'react';
import {
    ChevronDown,
    Heart,
    ListMusic,
    MoreHorizontal,
    Music2,
    Palette,
    Pause,
    Play,
    Repeat,
    Repeat1,
    SkipBack,
    SkipForward,
    Shuffle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppViewStore } from '../../../../stores/useAppViewStore';
import { openSettings } from '../../../../stores/useSettingsModalStore';
import { PlayerState } from '../../../../types';
import { colorWithAlpha, mixColors, parseColorChannels } from '../../../visualizer/colorMix';
import ProgressBar from '../../../ProgressBar';
import AudioToolButtons from '../../../audio-tools/AudioToolButtons';
import type { AppOverlaysModel } from '../buildAppOverlaysModel';
import MobileStageMenu from './MobileStageMenu';
import { useMobileGlass } from '../../../../hooks/useMobileGlass';
import { useMobileStageSubtitleClearance } from './useMobileStageSubtitleClearance';
import './mobileStageChrome.css';
import '../../../../styles/mobileGlass.css';

// src/components/app/overlays/mobile-stage/MobileStageChrome.tsx
// Main-display chrome only: reuse the existing playback/seek actions and MotionValue clock.
export default function MobileStageChrome({
    chrome,
    controls,
}: {
    chrome: NonNullable<AppOverlaysModel['mobileStage']>;
    controls: AppOverlaysModel['floatingControls'];
}) {
    const { t } = useTranslation();
    const [menuOpen, setMenuOpen] = useState(false);
    const closeMenu = useCallback(() => setMenuOpen(false), []);
    const panelOpen = useAppViewStore((state) => state.isPanelOpen);
    const stageRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<HTMLElement>(null);
    const hidden = panelOpen || (chrome.hidden && !menuOpen);
    useMobileGlass(playerRef, !hidden && !!controls && !controls.hideControlBar);
    useMobileStageSubtitleClearance(stageRef, !hidden && !!controls && !controls.hideControlBar);
    const openQueue = () => {
        const state = useAppViewStore.getState();
        state.setPanelTab('queue');
        state.setIsPanelOpen(true);
    };
    const bg = controls?.theme?.backgroundColor || (controls?.isDaylight ? '#f1f3ef' : '#071312');
    const ink = '#fffdf6';
    const accent = controls?.theme?.accentColor || '#f3d17e';
    const channels = parseColorChannels(bg);
    const lightBackground = channels && channels.r * 0.2126 + channels.g * 0.7152 + channels.b * 0.0722 > 170;
    const style = {
        '--mps-ink': ink,
        '--mps-muted': colorWithAlpha(ink, 0.65),
        '--mps-glass': mixColors('#111a16', bg, 0.22, lightBackground ? 0.7 : 0.56),
        '--mps-border': colorWithAlpha(ink, 0.15),
        '--mps-track': colorWithAlpha(ink, 0.18),
        '--mps-accent': accent,
    } as React.CSSProperties;
    const disabled = !controls || !!controls.controlsDisabled;
    return (
        <div
            ref={stageRef}
            className="mobile-player-stage"
            style={style}
            data-testid="mobile-stage-chrome"
            data-hidden={hidden || undefined}
        >
            <header className="mps-header">
                <button className="mps-icon mps-back" aria-label={t('mobileStage.back')} onClick={chrome.onBack}>
                <span className="mps-art" aria-hidden="true">
                    <Music2 size={23} />
                    {chrome.song?.coverUrl && (
                        <img
                            key={chrome.song.coverUrl}
                            src={chrome.song.coverUrl}
                            alt=""
                            onError={(event) => {
                                event.currentTarget.hidden = true;
                            }}
                        />
                    )}
                </span>
                <ChevronDown className="mps-back-chevron" size={15} aria-hidden="true" />
                </button>
                <div className="mps-song">
                    <strong>{chrome.song?.title || t('mobileLibrary.nothingPlaying')}</strong>
                    <span>{chrome.song?.artist || t('mobileLibrary.chooseMusic')}</span>
                </div>
                <button
                    className="mps-icon"
                    aria-label={t('mobileStage.lyricSettings')}
                    onClick={() => openSettings('options', 'visualizer', 'visualizer')}
                >
                    <Palette size={21} />
                </button>
                <button
                    className="mps-icon mps-like"
                    aria-label={t(controls?.slotContext.isLiked ? 'mobileStage.unlike' : 'mobileStage.like')}
                    aria-pressed={controls?.slotContext.isLiked || undefined}
                    disabled={!controls || controls.slotContext.likeDisabled}
                    onClick={() => controls?.slotContext.onLike()}
                >
                    <Heart size={21} fill={controls?.slotContext.isLiked ? 'currentColor' : 'none'} />
                </button>
                <button
                    className="mps-icon"
                    data-mps-more="true"
                    aria-label={t('mobileStage.more')}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((value) => !value)}
                >
                    <MoreHorizontal size={23} />
                </button>
                {menuOpen && <MobileStageMenu onClose={closeMenu} />}
            </header>
            {controls && !controls.hideControlBar && (
                <section ref={playerRef} className="mps-player" aria-label={t('mobileStage.playback')}>
                    <AudioToolButtons />
                    <div className="mps-transport">
                        <button
                            className="mps-secondary"
                            aria-label={t('mobileStage.loop')}
                            aria-pressed={controls.shuffleEnabled || controls.loopMode !== 'off'}
                            disabled={disabled}
                            onClick={controls.onToggleLoop}
                        >
                            {controls.shuffleEnabled ? <Shuffle size={21} /> : controls.loopMode === 'one' ? <Repeat1 size={21} /> : <Repeat size={21} />}
                            <span>{t(`mobileStage.loop_${controls.shuffleEnabled ? 'shuffle' : controls.loopMode}`)}</span>
                        </button>
                        <div className="mps-main-transport">
                            <button
                                className="mps-icon"
                                aria-label={controls.trackNavigation?.prevLabel || t('ui.previousTrack')}
                                disabled={disabled || !controls.trackNavigation?.canPrev}
                                onClick={controls.trackNavigation?.onPrev}
                            >
                                <SkipBack fill="currentColor" size={25} />
                            </button>
                            <button
                                className="mps-toggle"
                                aria-label={t(
                                    controls.playerState === PlayerState.PLAYING
                                        ? 'mobileLibrary.pause'
                                        : 'mobileLibrary.play'
                                )}
                                disabled={disabled || !controls.canTogglePlay}
                                onClick={controls.onTogglePlay}
                            >
                                {controls.playerState === PlayerState.PLAYING ? (
                                    <Pause fill="currentColor" size={28} />
                                ) : (
                                    <Play fill="currentColor" size={28} />
                                )}
                            </button>
                            <button
                                className="mps-icon"
                                aria-label={controls.trackNavigation?.nextLabel || t('ui.nextTrack')}
                                disabled={disabled || !controls.trackNavigation?.canNext}
                                onClick={controls.trackNavigation?.onNext}
                            >
                                <SkipForward fill="currentColor" size={25} />
                            </button>
                        </div>
                        <button
                            className="mps-secondary"
                            aria-label={t('mobileLibrary.queue')}
                            onClick={openQueue}
                        >
                            <ListMusic size={22} />
                            <span>{t('mobileStage.queue')}</span>
                        </button>
                    </div>
                    <div className="mps-progress">
                        <ProgressBar
                            currentTime={controls.currentTime}
                            duration={controls.duration}
                            onSeek={controls.onSeek}
                            primaryColor={accent}
                            secondaryColor={ink}
                            trackColor={colorWithAlpha(ink, 0.18)}
                            disabled={disabled || controls.duration <= 0}
                            ariaLabel={t('mobileStage.seek')}
                        />
                    </div>
                </section>
            )}
        </div>
    );
}

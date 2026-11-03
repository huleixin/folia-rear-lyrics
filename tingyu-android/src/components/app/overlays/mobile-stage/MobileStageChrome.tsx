import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { usePlayerViewModeStore } from '../../../../stores/usePlayerViewModeStore';
import { openSettings } from '../../../../stores/useSettingsModalStore';
import { PlayerState } from '../../../../types';
import { colorWithAlpha, mixColors, parseColorChannels } from '../../../visualizer/colorMix';
import ProgressBar from '../../../ProgressBar';
import type { AppOverlaysModel } from '../buildAppOverlaysModel';
import MobileStageMenu from './MobileStageMenu';
import { useMobileGlass } from '../../../../hooks/useMobileGlass';
import { useMobileStageSubtitleClearance } from './useMobileStageSubtitleClearance';
import { useComposeChrome } from '../../../../hooks/useComposeChrome';
import { useReducedMotionFor } from '../../../../hooks/useReducedMotionFor';
import { getPlaybackSongKey } from '../../../../utils/appPlaybackGuards';
import { playbackModeLabelKey, playbackModeLegacyToken, resolvePlaybackMode } from '../../../../utils/playbackMode';
import { usePlaybackStore } from '../../../../stores/usePlaybackStore';
import { warmSettingsModule, scheduleSettingsWarmup } from '../../dialogs/settingsModule';
import '../../../../styles/composeChrome.css';
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
    const stageTransition = usePlayerViewModeStore(state => state.stageTransition);
    const panelOpen = useAppViewStore((state) => state.isPanelOpen);
    const stageRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<HTMLElement>(null);
    const hidden = panelOpen || (chrome.hidden && !menuOpen);
    useEffect(scheduleSettingsWarmup,[]);

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
    const song = usePlaybackStore(s=>s.currentSong);
    const reducedMotion = useReducedMotionFor('uiMicroMotion');
    // The paired fade with the minimal page. The WebView layers dissolve; the native control bar
    // cannot (its alpha is owned by the native host, not by CSS), so it changes at the boundary
    // where the screen has already settled instead of in the middle of the fade: it arrives once the
    // stage is on screen, and it leaves when the stage is unmounted.
    const arriving = stageTransition === 'to-stage';
    // The same resolver the minimal page's single mode button uses — one name for the pair of
    // booleans, so the two views cannot show different modes for the same state.
    const mode = resolvePlaybackMode(controls?.shuffleEnabled, controls?.loopMode);
    const loop = playbackModeLegacyToken(mode);
    const compose = useComposeChrome(playerRef,'stage',!hidden&&!!controls&&!controls.hideControlBar&&!arriving,{
        playing:controls?.playerState===PlayerState.PLAYING,disabled,duration:controls?.duration||0,
        trackKey:song?getPlaybackSongKey(song):'',canNext:!!controls?.trackNavigation?.canNext,canPrevious:!!controls?.trackNavigation?.canPrev,
        loop,accent,ink,reducedMotion,labels:{play:t('mobileLibrary.play'),pause:t('mobileLibrary.pause'),queue:t('mobileStage.queue'),seek:t('mobileStage.seek'),loop:t('mobileStage.loop'),loopValue:t(playbackModeLabelKey(mode)),
        previous:controls?.trackNavigation?.prevLabel||t('ui.previousTrack'),next:controls?.trackNavigation?.nextLabel||t('ui.nextTrack')},
    },{toggle:controls?.onTogglePlay,previous:controls?.trackNavigation?.onPrev,next:controls?.trackNavigation?.onNext,loop:controls?.onToggleLoop,queue:openQueue,seek:controls?.onSeek},controls?.currentTime);
    useMobileGlass(playerRef,!compose&&!hidden&&!!controls&&!controls.hideControlBar);
    return (
        <div
            ref={stageRef}
            className="mobile-player-stage"
            style={style}
            data-testid="mobile-stage-chrome"
            data-hidden={hidden || undefined}
            data-arriving={arriving || undefined}
        >
            <header className="mps-header">
                {/* Collapse, on its own, where the minimal page keeps it. It used to be a chevron
                    laid over the artwork: the same pixels answered "go back" and "that is the
                    sleeve", the cover could not be shown whole, and the gesture the listener had
                    just learned on the minimal page was not there. Three separate things now —
                    arrow, sleeve, titles — on the same 44dp target the minimal bar uses. */}
                <button
                    type="button"
                    className="mps-icon mps-collapse"
                    aria-label={t('mobileStage.back')}
                    onClick={chrome.onBack}
                    data-testid="stage-collapse"
                >
                    <ChevronDown size={23} strokeWidth={1.8} />
                </button>
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
                <div className="mps-song">
                    <strong>{chrome.song?.title || t('mobileLibrary.nothingPlaying')}</strong>
                    <span>{chrome.song?.artist || t('mobileLibrary.chooseMusic')}</span>
                </div>
                <button
                    className="mps-icon"
                    aria-label={t('mobileStage.lyricSettings')}
                    onPointerDown={warmSettingsModule}
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
                <section ref={playerRef} className="mps-player" style={compose?{height:136,boxSizing:"border-box"}:undefined} aria-label={t('mobileStage.playback')}>
                    {!compose && <>
                    <div className="mps-transport">
                        <button
                            className="mps-secondary"
                            aria-label={t('mobileStage.loop')}
                            aria-pressed={mode !== 'order'}
                            data-mode={mode}
                            disabled={disabled}
                            onClick={controls.onToggleLoop}
                        >
                            {mode === 'shuffle' ? <Shuffle size={21} /> : mode === 'one' ? <Repeat1 size={21} /> : <Repeat size={21} />}
                            <span>{t(playbackModeLabelKey(mode))}</span>
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
                            renderActive={!compose}
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
                    </>}
                </section>
            )}
        </div>
    );
}

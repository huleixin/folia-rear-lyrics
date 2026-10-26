import React, { useRef } from 'react';
import { Pause, Play, ListMusic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LibrarySuiteStageProps } from '../../core/contracts/suite';
import {
    usePlaybackStore,
    selectDisplaySong,
    selectDisplayCoverUrl,
    selectDisplayPlayerState,
} from '../../../stores/usePlaybackStore';
import { PlayerState } from '../../../types';
import { getSongArtistLabel } from '../../../services/onlineMusic/songMetadata';
import MobileArtwork from './MobileArtwork';
import { useMobileGlass } from '../../../hooks/useMobileGlass';
import { useAppViewStore } from '../../../stores/useAppViewStore';
import { useMiniPlayerSwipe } from './useMiniPlayerSwipe';
import MiniPlayerProgress from './MiniPlayerProgress';

// src/library/suites/mobile/MobileMiniPlayer.tsx
// Transport actions stay with the host; gestures and the tiny progress ring never re-render the page.
export default function MobileMiniPlayer({
    onBackToPlayer,
    onTogglePlayback,
    onNextTrack,
    canNextTrack,
    onPreviousTrack,
    canPreviousTrack,
    nextTrackLabel,
    previousTrackLabel,
}: Pick<LibrarySuiteStageProps, 'onBackToPlayer' | 'onTogglePlayback' | 'onNextTrack' | 'canNextTrack' | 'onPreviousTrack' | 'canPreviousTrack' | 'nextTrackLabel' | 'previousTrackLabel'>) {
    const { t } = useTranslation();
    const song = usePlaybackStore(selectDisplaySong);
    const cover = usePlaybackStore(selectDisplayCoverUrl);
    const state = usePlaybackStore(selectDisplayPlayerState);
    const glassRef = useRef<HTMLDivElement>(null);
    useMobileGlass(glassRef);
    useMiniPlayerSwipe(glassRef, onNextTrack, onPreviousTrack, !!song && !!canNextTrack, !!song && !!canPreviousTrack);
    const openQueue = () => {
        const view = useAppViewStore.getState(); view.setPanelTab('queue'); view.setIsPanelOpen(true);
    };
    return (
        <div ref={glassRef} className="ml-mini" data-testid="mobile-mini-player">
            <div className="ml-mini-swipe-window">
                <span className="ml-mini-preview" aria-hidden="true">
                    <span data-direction="next">{nextTrackLabel || t('ui.nextTrack')}</span>
                    <span data-direction="previous">{previousTrackLabel || t('ui.previousTrack')}</span>
                </span>
            <button className="ml-mini-track" onClick={onBackToPlayer} aria-label={t('mobileLibrary.openStage')}>
                <MobileArtwork src={cover} />
                <span className="ml-mini-copy">
                    <strong>{song?.name || t('mobileLibrary.nothingPlaying')}</strong>
                    <small>{song ? getSongArtistLabel(song) : t('mobileLibrary.chooseMusic')}</small>
                </span>
            </button>
            </div>
            <div className="ml-mini-controls">
                <button
                    className="ml-icon ml-mini-toggle"
                    disabled={!song || !onTogglePlayback}
                    onClick={onTogglePlayback}
                    aria-label={t(state === PlayerState.PLAYING ? 'mobileLibrary.pause' : 'mobileLibrary.play')}
                >
                    <MiniPlayerProgress />
                    {state === PlayerState.PLAYING ? (
                        <Pause size={22} fill="currentColor" />
                    ) : (
                        <Play size={22} fill="currentColor" />
                    )}
                </button>
                <button
                    className="ml-icon ml-mini-queue"
                    onClick={openQueue}
                    aria-label={t('mobileLibrary.queue')}
                >
                    <ListMusic size={24} />
                </button>
            </div>
        </div>
    );
}

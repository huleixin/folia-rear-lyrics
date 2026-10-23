import React from 'react';
import { Pause, Play, SkipForward } from 'lucide-react';
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
import { useLiquidGlass } from '../../../hooks/useLiquidGlass';

// src/library/suites/mobile/MobileMiniPlayer.tsx
// Transport only: no per-frame clock subscription or second floating progress capsule.
export default function MobileMiniPlayer({
    onBackToPlayer,
    onTogglePlayback,
    onNextTrack,
    canNextTrack,
}: Pick<LibrarySuiteStageProps, 'onBackToPlayer' | 'onTogglePlayback' | 'onNextTrack' | 'canNextTrack'>) {
    const { t } = useTranslation();
    const song = usePlaybackStore(selectDisplaySong);
    const cover = usePlaybackStore(selectDisplayCoverUrl);
    const state = usePlaybackStore(selectDisplayPlayerState);
    const glassRef = useLiquidGlass<HTMLDivElement>();
    return (
        <div ref={glassRef} className="ml-mini" data-testid="mobile-mini-player">
            <button className="ml-mini-track" onClick={onBackToPlayer} aria-label={t('mobileLibrary.openStage')}>
                <MobileArtwork src={cover} />
                <span className="ml-mini-copy">
                    <strong>{song?.name || t('mobileLibrary.nothingPlaying')}</strong>
                    <small>{song ? getSongArtistLabel(song) : t('mobileLibrary.chooseMusic')}</small>
                </span>
            </button>
            <div className="ml-mini-controls">
                <button
                    className="ml-icon ml-mini-toggle"
                    disabled={!song || !onTogglePlayback}
                    onClick={onTogglePlayback}
                    aria-label={t(state === PlayerState.PLAYING ? 'mobileLibrary.pause' : 'mobileLibrary.play')}
                >
                    {state === PlayerState.PLAYING ? (
                        <Pause size={22} fill="currentColor" />
                    ) : (
                        <Play size={22} fill="currentColor" />
                    )}
                </button>
                <button
                    className="ml-icon ml-mini-next"
                    disabled={!song || !onNextTrack || !canNextTrack}
                    onClick={onNextTrack}
                    aria-label={t('ui.nextTrack')}
                >
                    <SkipForward size={25} fill="currentColor" />
                </button>
            </div>
        </div>
    );
}

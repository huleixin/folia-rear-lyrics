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
import { currentTime } from '../../../stores/motionSignals';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';
import { selectDisplayDuration } from '../../../stores/usePlaybackStore';
import { useComposeChrome } from '../../../hooks/useComposeChrome';
import { useNativeChromeCover } from '../../../hooks/useNativeChromeCover';
import { useReducedMotionFor } from '../../../hooks/useReducedMotionFor';
import { useSearchNavigationStore } from '../../../stores/useSearchNavigationStore';
import { useSettingsModalStore } from '../../../stores/useSettingsModalStore';
import { useAudioSettingsStore } from '../../../stores/useAudioSettingsStore';
import { useAudioToolsStore, QUALITY_LABELS } from '../../../stores/useAudioToolsStore';
import { QualityButton } from '../../../components/audio-tools/AudioToolButtons';

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

    useMiniPlayerSwipe(glassRef, onNextTrack, onPreviousTrack, !!song && !!canNextTrack, !!song && !!canPreviousTrack);
    const openQueue = () => {
        const view = useAppViewStore.getState(); view.setPanelTab('queue'); view.setIsPanelOpen(true);
    };
    const active = useAppViewStore(s=>s.view==='home'&&!s.isPanelOpen);
    const searchOpen = useSearchNavigationStore(s=>s.isSearchOpen);
    const settingsOpen = useSettingsModalStore(s=>s.settingsModalState.isOpen);
    const duration = usePlaybackStore(selectDisplayDuration);
    const quality = useAudioSettingsStore(s=>s.audioQuality);
    const reducedMotion = useReducedMotionFor('uiMicroMotion');
    const nativeCover = useNativeChromeCover(cover,active&&!searchOpen&&!settingsOpen);
    const compose = useComposeChrome(glassRef,'mini',active&&!searchOpen&&!settingsOpen,{
        title:song?.name||t('mobileLibrary.nothingPlaying'),artist:song?getSongArtistLabel(song):t('mobileLibrary.chooseMusic'),cover:nativeCover,
        trackKey:song?getPlaybackSongKey(song):'',playing:state===PlayerState.PLAYING,disabled:!song||!onTogglePlayback,
        duration,canNext:!!song&&!!canNextTrack,canPrevious:!!song&&!!canPreviousTrack,reducedMotion,ink:'#eef5ef',accent:'#86d8b8',
        labels:{next:nextTrackLabel||t('ui.nextTrack'),previous:previousTrackLabel||t('ui.previousTrack'),play:t('mobileLibrary.play'),pause:t('mobileLibrary.pause'),queue:t('mobileLibrary.queue'),quality:'音质切换',qualityValue:QUALITY_LABELS[quality]},
    },{openStage:onBackToPlayer,toggle:onTogglePlayback,next:onNextTrack,previous:onPreviousTrack,queue:openQueue,quality:()=>useAudioToolsStore.getState().show()},currentTime);
    useMobileGlass(glassRef,!compose);
    return (
        <div ref={glassRef} className="ml-mini" data-testid="mobile-mini-player">
            {!compose && <>
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
            <QualityButton />
            <div className="ml-mini-controls">
                <button
                    className="ml-icon ml-mini-toggle"
                    disabled={!song || !onTogglePlayback}
                    onClick={onTogglePlayback}
                    aria-label={t(state === PlayerState.PLAYING ? 'mobileLibrary.pause' : 'mobileLibrary.play')}
                >
                    <MiniPlayerProgress renderActive={!compose} />
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
            </>}
        </div>
    );
}

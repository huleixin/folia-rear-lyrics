import {useSleepTimerStore} from '../../../stores/useSleepTimerStore';
import React, { useRef } from 'react';
import PlayerControlIcon from '../../../components/app/icons/PlayerControlIcon';
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
import { openNativeQueueSheet } from '../../../services/nativeMinimalQueue';
import { useAppViewStore } from '../../../stores/useAppViewStore';
import { useMiniPlayerSwipe } from './useMiniPlayerSwipe';
import MiniPlayerProgress from './MiniPlayerProgress';
import { currentTime } from '../../../stores/motionSignals';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';
import { selectDisplayDuration } from '../../../stores/usePlaybackStore';
import { useComposeChrome } from '../../../hooks/useComposeChrome';
import { useNativeChromeCover } from '../../../hooks/useNativeChromeCover';
import { recoveryReady } from '../../../services/playbackRecoverySnapshot';
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
    const sleepPreferredMinutes=useSleepTimerStore(s=>s.sleepTimerHours*60+s.sleepTimerMinutes||30);
    const { t } = useTranslation();
    const song = usePlaybackStore(selectDisplaySong);
    const cover = usePlaybackStore(selectDisplayCoverUrl);
    const state = usePlaybackStore(selectDisplayPlayerState);
    const glassRef = useRef<HTMLDivElement>(null);

    useMiniPlayerSwipe(glassRef, onNextTrack, onPreviousTrack, !!song && !!canNextTrack, !!song && !!canPreviousTrack);
    const openQueue = () => {
        void openNativeQueueSheet().then(handled => {
            if (handled) return;
            const view = useAppViewStore.getState(); view.setPanelTab('queue'); view.setIsPanelOpen(true);
        });
    };
    const active = useAppViewStore(s=>s.view==='home'&&!s.isPanelOpen);
    const searchOpen = useSearchNavigationStore(s=>s.isSearchOpen);
    const settingsOpen = useSettingsModalStore(s=>s.settingsModalState.isOpen);
    const duration = usePlaybackStore(selectDisplayDuration);
    const quality = useAudioSettingsStore(s=>s.audioQuality);
    const reducedMotion = useReducedMotionFor('uiMicroMotion');
    // 启动专项（录屏 68710）：重建后 session restore 异步完成前 currentSong 为 null，
    // 此刻发布的迷你包就是「还没有播放音乐」，会顶掉原生缓存的上一会话迷你条。
    // 恢复未完成且当前无歌时暂不发包：原生继续显示缓存迷你条，恢复完成后若确实
    // 无歌再发布空态。恢复必然终止（成功/清空/失败都会 finishRecovery），这个
    // 闸门只是短暂启动窗口，不是固定延迟；暖恢复时 recoveryReady() 恒为 true。
    const recoveryHold = !recoveryReady() && !song;
    const nativeCover = useNativeChromeCover(cover,active&&!searchOpen&&!settingsOpen);
    const compose = useComposeChrome(glassRef,'mini',active&&!searchOpen&&!settingsOpen,{
        title:song?.name||t('mobileLibrary.nothingPlaying'),artist:song?getSongArtistLabel(song):t('mobileLibrary.chooseMusic'),cover:nativeCover,
        trackKey:song?getPlaybackSongKey(song):'',playing:state===PlayerState.PLAYING,disabled:!song||!onTogglePlayback,
        sleepPreferredMinutes,
        duration,canNext:!!song&&!!canNextTrack,canPrevious:!!song&&!!canPreviousTrack,reducedMotion,ink:'#eef5ef',accent:'#86d8b8',
        labels:{next:nextTrackLabel||t('ui.nextTrack'),previous:previousTrackLabel||t('ui.previousTrack'),play:t('mobileLibrary.play'),pause:t('mobileLibrary.pause'),queue:t('mobileLibrary.queue'),quality:'音质切换',qualityValue:QUALITY_LABELS[quality]},
    },{openStage:onBackToPlayer,toggle:onTogglePlayback,next:onNextTrack,previous:onPreviousTrack,queue:openQueue,quality:()=>useAudioToolsStore.getState().show()},currentTime,recoveryHold);
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
                        <PlayerControlIcon kind="pause" size={22} />
                    ) : (
                        <PlayerControlIcon kind="play" size={22} />
                    )}
                </button>
                <button
                    className="ml-icon ml-mini-queue"
                    onClick={openQueue}
                    aria-label={t('mobileLibrary.queue')}
                >
                    <PlayerControlIcon kind="queue" size={24} />
                </button>
            </div>
            </>}
        </div>
    );
}

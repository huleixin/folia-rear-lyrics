import { nativeAudioIdentity } from '../../../services/playbackOutputIdentity';

// src/components/app/presentation/buildPlayerViewFlags.ts

// Builds top-level player-view booleans used by the shell, overlays, and floating controls.
export const buildPlayerViewFlags = ({
    currentView,
    disableHomeDynamicBackground,
    hidePlayerProgressBar,
    hidePlayerTranslationSubtitle,
    hidePlayerRightPanelButton,
    isNowPlayingControlDisabled,
    activePlaybackContext,
    stageActiveEntryKind,
    audioSrc,
    duration,
    activeAudio,
    songKey,
}: {
    currentView: string;
    disableHomeDynamicBackground: boolean;
    hidePlayerProgressBar: boolean;
    hidePlayerTranslationSubtitle: boolean;
    hidePlayerRightPanelButton: boolean;
    isNowPlayingControlDisabled: boolean;
    activePlaybackContext: 'main' | 'stage';
    stageActiveEntryKind: string | null;
    audioSrc: string | null;
    duration: number;
    activeAudio?: HTMLMediaElement | null;
    songKey?: string;
}) => {
    const identity = nativeAudioIdentity(activeAudio ?? null);
    // Read the existing output lease. A stale player-state flag or an old deck cannot enable it.
    const nativeControllable = !!activeAudio && !!identity?.sessionId && !!identity.epoch
        && !!songKey && identity.songKey === songKey && !activeAudio.error
        && (activeAudio.readyState > 0 || !activeAudio.paused && !activeAudio.ended);
    const isPlayerView = currentView === 'player';
    return {
        isPlayerView,
        playbackPreparing: !isNowPlayingControlDisabled && !!activeAudio && !activeAudio.error
            && activeAudio.networkState === 2 && activeAudio.readyState < 2
            && !!songKey && identity?.songKey === songKey && !!identity.sessionId,
        shouldPauseVisualizerBackground: currentView !== 'player' && disableHomeDynamicBackground,
        shouldHidePlayerProgressBar: isPlayerView && hidePlayerProgressBar,
        shouldHidePlayerTranslationSubtitle: isPlayerView && hidePlayerTranslationSubtitle,
        shouldHidePlayerRightPanelButton: isPlayerView && hidePlayerRightPanelButton,
        canToggleCurrentPlayback: !isNowPlayingControlDisabled && Boolean(
            audioSrc || nativeControllable || (activePlaybackContext === 'stage' && stageActiveEntryKind === 'lyrics' && duration > 0),
        ),
    };
};

import { useEffect } from 'react';
import { useAudioToolsStore } from '../stores/useAudioToolsStore';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import type { OnlineRecoveryOptions, OnlineRecoveryResult } from '../types/playbackFailure';
import { PlayerState } from '../types';

// src/hooks/useAudioQualitySwitch.ts
export function useAudioQualitySwitch(recover: (options: OnlineRecoveryOptions) => Promise<OnlineRecoveryResult>) {
    const request = useAudioToolsStore(state => state.request);
    useEffect(() => {
        if (!request) return;
        let alive = true;
        const previousActual = useAudioToolsStore.getState().actual;
        const song = usePlaybackStore.getState().currentSong;
        useAudioToolsStore.setState({ switching: true });
        void recover({ autoplay: usePlaybackStore.getState().playerState === PlayerState.PLAYING,
            shouldAutoplay: () => usePlaybackStore.getState().playerState === PlayerState.PLAYING,
            force: true, bypassMediaCache: true, qualityOverride: request.quality,
        }).then(result => {
            if (!alive) return;
            if (result.status === 'recovered') {
                useAudioSettingsStore.getState().setAudioQuality(request.quality);
            } else if (result.status === 'not-attempted' && !song) {
                useAudioSettingsStore.getState().setAudioQuality(request.quality);
            } else if (result.status === 'failed') {
                useAudioToolsStore.setState({ actual: previousActual, error: '音质切换失败，继续播放原音质' });
            }
        }).catch(() => { if (alive) useAudioToolsStore.setState({ actual: previousActual, error: '音质切换失败，继续播放原音质' }); })
            .finally(() => { if (alive) useAudioToolsStore.setState({ switching: false, request: null }); });
        return () => { alive = false; };
    // recover contains current transport refs; restarting on its identity change would repeat a switch.
    }, [request]);
}

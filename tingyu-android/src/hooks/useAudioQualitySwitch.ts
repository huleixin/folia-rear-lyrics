import { useEffect } from 'react';
import { useAudioToolsStore } from '../stores/useAudioToolsStore';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import type { OnlineRecoveryOptions, OnlineRecoveryResult } from '../types/playbackFailure';
import { useLxSourceStore } from '../stores/useLxSourceStore';
import { PlayerState } from '../types';

// src/hooks/useAudioQualitySwitch.ts
export function useAudioQualitySwitch(recover: (options: OnlineRecoveryOptions) => Promise<OnlineRecoveryResult>) {
    useEffect(()=>useLxSourceStore.subscribe((next,previous)=>{
        const signature=(state:typeof next)=>{const script=state.scripts.find(item=>item.id===state.activeId);return [state.activeId,script?.code] as const};
        const before=signature(previous),after=signature(next);
        if(before[0]===after[0]&&before[1]===after[1])return;
        if(usePlaybackStore.getState().currentSong?.sourceRef?.kind!=='online')return;
        useAudioToolsStore.setState({request:{quality:useAudioSettingsStore.getState().audioQuality,id:Date.now(),reason:'source'},error:''});
    }),[]);
    const request = useAudioToolsStore(state => state.request);
    useEffect(() => {
        if (!request) return;
        let alive = true;
        const errorText=request.reason==='source'?'音源切换失败，请检查自定义源或更换歌曲':'音质切换失败，继续播放原音质';
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
                useAudioToolsStore.setState({ actual: previousActual, error: errorText });
            }
        }).catch(() => { if (alive) useAudioToolsStore.setState({ actual: previousActual, error: errorText }); })
            .finally(() => { if (alive) useAudioToolsStore.setState({ switching: false, request: null }); });
        return () => { alive = false; };
    // recover contains current transport refs; restarting on its identity change would repeat a switch.
    }, [request]);
}

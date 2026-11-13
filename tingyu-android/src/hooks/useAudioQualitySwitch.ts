import { useEffect } from 'react';
import { useAudioToolsStore } from '../stores/useAudioToolsStore';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import type { OnlineRecoveryOptions, OnlineRecoveryResult } from '../types/playbackFailure';
import { useLxSourceStore } from '../stores/useLxSourceStore';
import { PlayerState } from '../types';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { diagnosticEvent } from '../services/diagnostics/diagnosticLog';

// src/hooks/useAudioQualitySwitch.ts
export function useAudioQualitySwitch(recover: (options: OnlineRecoveryOptions) => Promise<OnlineRecoveryResult>) {
    useEffect(()=>useLxSourceStore.subscribe((next,previous)=>{
        const signature=(state:typeof next)=>{const script=state.scripts.find(item=>item.id===state.activeId);return [state.activeId,script?.code,JSON.stringify(state.policy)] as const};
        const before=signature(previous),after=signature(next);
        if(before[0]===after[0]&&before[1]===after[1]&&before[2]===after[2])return;
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
        const songKey = song ? getPlaybackSongKey(song) : null;
        const isCurrentSong = () => {
            const current = usePlaybackStore.getState().currentSong;
            return (current ? getPlaybackSongKey(current) : null) === songKey;
        };
        useAudioToolsStore.setState({ switching: true });
        diagnosticEvent('audio', 'info', 'quality-switch-start', { quality: request.quality, reason: request.reason ?? 'quality', requestId: request.id });
        void recover({ autoplay: usePlaybackStore.getState().playerState === PlayerState.PLAYING,
            shouldAutoplay: () => usePlaybackStore.getState().playerState === PlayerState.PLAYING,
            force: true, bypassMediaCache: true, qualityOverride: request.quality,
        }).then(result => {
            diagnosticEvent('audio', result.status === 'failed' ? 'warn' : 'info', 'quality-switch-result', { quality: request.quality, status: result.status, requestId: request.id });
            if (!alive || !isCurrentSong()) return;
            if (result.status === 'recovered') {
                useAudioSettingsStore.getState().setAudioQuality(request.quality);
            } else if (result.status === 'not-attempted' && !song) {
                useAudioSettingsStore.getState().setAudioQuality(request.quality);
            } else if (result.status === 'failed') {
                useAudioToolsStore.setState({ actual: previousActual, error: errorText });
            } else if (result.status === 'not-attempted') {
                useAudioToolsStore.setState({ error: '当前播放暂时无法切换音质，请重新播放歌曲后重试' });
            }
        }).catch(() => {
            diagnosticEvent('audio', 'warn', 'quality-switch-error', { quality: request.quality, requestId: request.id });
            if (alive && isCurrentSong()) useAudioToolsStore.setState({ actual: previousActual, error: errorText });
        })
            .finally(() => { if (alive) useAudioToolsStore.setState({ switching: false, request: null }); });
        return () => { alive = false; };
    // recover contains current transport refs; restarting on its identity change would repeat a switch.
    }, [request]);
}

import { resourceCollectionOrigin } from '../services/playlistResourceSnapshot';
import { useEffect } from 'react';
import type { RefObject } from 'react';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { currentTime } from '../stores/motionSignals';
import { shufflePlayback } from '../services/shufflePlayback';
import { checkpointRecovery, createQueueSnapshot, recoveryOrigin, recoveryReady, saveRecoverySnapshot } from '../services/playbackRecoverySnapshot';
import { discardRecoveryPosition } from '../services/androidSessionRecovery';
import { getPlaybackSongKey, isStagePlaybackSong } from '../utils/appPlaybackGuards';
import { isCapacitorAndroid } from '../platform/runtime';

// src/hooks/usePlaybackSessionPersistence.ts
export function usePlaybackSessionPersistence(audio:RefObject<HTMLAudioElement|null>){
    useEffect(()=>{
        if(!isCapacitorAndroid())return;
        let priorQueue:unknown,priorSong='',priorMode='',dirty=true;
        const mode=()=>{const s=useAudioSettingsStore.getState();return s.shuffleEnabled?'shuffle' as const:s.loopMode;};
        const save=()=>{
            const s=usePlaybackStore.getState();if(!recoveryReady()||s.activePlaybackContext!=='main'||isStagePlaybackSong(s.currentSong))return;
            const key=s.currentSong?getPlaybackSongKey(s.currentSong):'';
            // Default empty boot state is not an explicit user Clear. Preserve unsupported/corrupt snapshots.
            if(!key&&!s.playQueue.length&&!priorSong)return;
            discardRecoveryPosition(key);
            const modeIdentity=mode()+'|'+useAudioSettingsStore.getState().loopMode;
            if(dirty||priorQueue!==s.playQueue||priorSong!==key||priorMode!==modeIdentity){
                priorQueue=s.playQueue;priorSong=key;priorMode=modeIdentity;dirty=false;
                const order=useAudioSettingsStore.getState().shuffleEnabled?shufflePlayback.recoveryOrder():s.playQueue.map(getPlaybackSongKey);
                void saveRecoverySnapshot(createQueueSnapshot(s.currentSong,s.playQueue,mode(),order,currentTime.get()*1000,resourceCollectionOrigin(key)??recoveryOrigin(key)??{context:s.activePlaybackContext},useAudioSettingsStore.getState().loopMode))
                    .catch(()=>{dirty=true;});
            }
        };
        const checkpoint=()=>{
            save();const s=usePlaybackStore.getState();
            if(!recoveryReady()||s.activePlaybackContext!=='main'||!s.currentSong)return;
            void checkpointRecovery(getPlaybackSongKey(s.currentSong),currentTime.get()*1000,mode()).catch(()=>{});
        };
        const a=usePlaybackStore.subscribe(save),b=useAudioSettingsStore.subscribe(save);
        // 4 秒节流：进程被系统直接终止时，最多只丢最后几秒。全量队列快照按内容去重，
        // 心跳实际只写很小的 cursor，不会每 4 秒重写整份队列。
        const timer=setInterval(checkpoint,4000);
        const background=()=>{if(document.visibilityState!=='visible')checkpoint();};
        const leaving=()=>{checkpoint();};
        document.addEventListener('visibilitychange',background);
        // 不能只靠 onDestroy / visibilitychange：Activity 被回收或进程被杀时，
        // pagehide / beforeunload 是最后两次有机会把当前位置落盘的事件。
        window.addEventListener('pagehide',leaving);
        window.addEventListener('beforeunload',leaving);
        window.addEventListener('tingyu-playback-recovery-ready',save);
        const originChanged=()=>{dirty=true;save();};window.addEventListener('tingyu-playback-origin',originChanged);
        const mediaEvent=(event:Event)=>{if(event.target===audio.current)checkpoint();};
        // Capture also follows the active deck after refs change; media events do not bubble.
        document.addEventListener('pause',mediaEvent,true);document.addEventListener('seeked',mediaEvent,true);
        return()=>{a();b();clearInterval(timer);document.removeEventListener('visibilitychange',background);window.removeEventListener('pagehide',leaving);window.removeEventListener('beforeunload',leaving);window.removeEventListener('tingyu-playback-recovery-ready',save);window.removeEventListener('tingyu-playback-origin',originChanged);document.removeEventListener('pause',mediaEvent,true);document.removeEventListener('seeked',mediaEvent,true);};
    },[audio]);
}

import { consumeRecoveryPosition } from '../services/androidSessionRecovery';
import { shouldUseCompatibleDecoder } from '../utils/nativePlaybackFailure';
import { PLAYBACK_TEST_SESSION_ENGINE } from '../utils/playbackEngineTestBuild';
import { setPlaybackTestActual } from '../stores/usePlaybackEngineTestStore';
import { installPlaybackTestMediaLog, notePlaybackTest } from '../services/playbackTestLog';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { getTingyuPlayback } from '../platform/tingyuPlayback';
import { attachNativeAudioElement } from '../services/nativeAudioElement';
import type { NativeAudioPort } from '../types/nativeAudio';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { useAutomixSettingsStore } from '../stores/useAutomixSettingsStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { useAppViewStore } from '../stores/useAppViewStore';
import { useRearRuntimeStore } from '../stores/useRearRuntimeStore';
import { useMainStageActive } from './useStageActivity';
import { isAndroidNativeRuntime } from '../utils/platform';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { setStatusMessage } from '../stores/useStatusMessageStore';
import { PlayerState } from '../types';
import { buildNativePlaybackPayload } from '../services/nativePlaybackBridge';
import { ensureCompatibleSleepOutput, hasCompatibleSleepOutput, releaseCompatibleSleepOutput } from '../services/compatibleSleepOutput';

// src/hooks/useNativeAudioDeck.ts
const native = getTingyuPlayback<NativeAudioPort>();
export const nativeAudioUri = (source: string | null) => !source || /^(https?:|content:|file:|blob:)/.test(source);
export function useNativeAudioDeck(audioRef: RefObject<HTMLAudioElement | null>, activeDeck: string, playbackGeneration?: RefObject<number>, quietCompatibleGraph?:(reason:'timer'|'handoff')=>Promise<boolean>, autoplayIntent?:RefObject<boolean>) {
    const android = isAndroidNativeRuntime(), requested = PLAYBACK_TEST_SESSION_ENGINE !== 'web';
    const [supported, setSupported] = useState<boolean | null>(android ? null : false);
    const [failedAttempt, setFailedAttempt] = useState<{ token: string; reason: string } | null>(null);
    const [ready, setReady] = useState(false);
    const [webReady, setWebReady] = useState(false);
    const adapter = useRef<ReturnType<typeof attachNativeAudioElement> | null>(null);
    const source = usePlaybackStore(s => s.audioSrc), song = usePlaybackStore(s => s.currentSong);
    const gain = usePlaybackStore(s => s.replayGainMode), playing = usePlaybackStore(s => s.playerState === PlayerState.PLAYING);
    const effects = useAudioSettingsStore(s => s.audioEqualizerSettings.enabled), fade = useAudioSettingsStore(s => s.playbackFadeEnabled);
    const loop = useAudioSettingsStore(s => s.loopMode), mixing = useAutomixSettingsStore(s => s.automixEnabled);
    const main = useMainStageActive(), view = useAppViewStore(s => s.view), rear = useRearRuntimeStore(s => s.enabled && !s.sleeping);
    const songKey = song ? getPlaybackSongKey(song) : '';
    const generation = playbackGeneration?.current ?? 0;
    const attempt = JSON.stringify([songKey, playbackGeneration ? generation : source]);
    const restriction = effects ? 'effects' : mixing ? 'automix' : gain !== 'off' ? 'replaygain' : !nativeAudioUri(source) ? 'unsupported-uri' : '';
    const failure = failedAttempt?.token === attempt ? failedAttempt.reason : '';
    const own = android && requested && supported !== false && !restriction && !failure;
    const analysis = playing && ((main && view === 'player') || rear);
    const options=useRef({fade,analysis,loop:loop==='one',interactive:main||rear});
    options.current={fade,analysis,loop:loop==='one',interactive:main||rear};
    const latest = useRef({ source, songKey, song, playing, attempt });
    latest.current = { source, songKey, song, playing, attempt };
    const quietGraph=useRef(quietCompatibleGraph);quietGraph.current=quietCompatibleGraph;
    const transfer = useRef<Promise<void> | null>(null);
    const retainedElement = useRef<HTMLAudioElement | null>(null);
    const handoff = useRef<{ source: string; track: string; position: number; requestedPlaying?:boolean } | null>(null);
    useEffect(() => {
        installPlaybackTestMediaLog();
        if (!android || !requested || supported === true) return;
        let disposed = false;
        const timer = setTimeout(() => { if (!disposed) { disposed = true; notePlaybackTest('native-probe-timeout'); setSupported(false); } }, 4000);
        notePlaybackTest('native-probe-start');
        void native.probe().then(value => { if (!disposed) { clearTimeout(timer); setSupported(value.supported === true); } })
            .catch(() => { if (!disposed) { clearTimeout(timer); setSupported(false); } });
        return () => { disposed = true; clearTimeout(timer); };
        // A transient probe failure is retryable for a new attempt, never a decoder verdict.
    }, [android, requested, attempt]);
    const reason = !requested ? 'selected-compatible' : restriction || failure || (supported === null ? 'probing' : supported === false ? 'native-unavailable' : 'native-selected');
    useEffect(() => {
        const actual = own ? (ready ? 'media3' : 'pending') : android&&requested&&!webReady?'pending':'web';
        setPlaybackTestActual(actual, reason); notePlaybackTest('actual-engine', { actual, reason });
    }, [own, ready, webReady, android, requested, reason]);
    useEffect(() => {
        const element = audioRef.current;
        if (!own || !ready || !element) return;
        const captured = attempt;
        const fallback = (event:Event) => {
            const state=usePlaybackStore.getState();
            if (latest.current.attempt !== captured || state.audioSrc!==source || (state.currentSong?getPlaybackSongKey(state.currentSong):'')!==songKey || (playbackGeneration?.current??0)!==generation) return;
            const error = element.error as (MediaError & { nativeCacheFailure?: boolean;nativeCompatibilityClaimed?:boolean }) | null;
            if(error?.nativeCompatibilityClaimed===false)return;
            const cause = error?.nativeCacheFailure ? 'cache-bridge-unavailable' : shouldUseCompatibleDecoder(error) ? 'track-decoder-fallback' : '';
            if (!cause) return;
            event.stopImmediatePropagation(); // Exactly one owner handles this error, not URL recovery too.
            setFailedAttempt({ token: captured, reason: cause });
            setStatusMessage({ type: 'info', text: cause === 'track-decoder-fallback' ? '当前音频解码失败，本曲使用兼容通道；下一首重试原生' : '当前缓存无法交给原生读取，本曲使用兼容通道' });
        };
        element.addEventListener('error', fallback,true);
        return () => element.removeEventListener('error', fallback,true);
    }, [own, ready, attempt, audioRef]);
    const commitSource = () => {
        const current = latest.current, value = adapter.current;
        if (!value) return;
        const restored = handoff.current;
        // 冷恢复刻意不解析音源（要等用户按 Play），此刻 audioSrc 为空、setSource 会直接
        // 丢弃位置。恢复位置是一次性的：绝不能在这个空音源阶段消费掉，否则等 URL 重新
        // 解析完、真正 prepare 时只剩 0，歌记住了、进度却从头开始。只在有音源可装载时
        // 才消费；空音源时把位置留在恢复容器里，同时 UI 时钟仍显示 plan.positionMs。
        const hasSource = !!current.source;
        const position = restored?.source === current.source && restored.track === current.songKey
            ? restored.position
            : hasSource ? (consumeRecoveryPosition(current.songKey) ?? 0) / 1000 : 0;
        value.setSource(current.source ?? '', current.songKey, {...(current.song ? buildNativePlaybackPayload(current.song, current.playing, position, (current.song.durationMs ?? 0) / 1000) : {}),playbackAttempt:current.attempt});
    };
    useLayoutEffect(() => {
        if (!android) return;
        let cancelled = false, owned: ReturnType<typeof attachNativeAudioElement> | null = null;
        const element = audioRef.current ?? retainedElement.current;
        if (!element) return;
        retainedElement.current = element;
        const installNative = () => {
            if (cancelled || !element.isConnected) return;
            audioRef.current = element;
            if (own && supported === true) {
                const wasCompatible = !!element.getAttribute('src') || handoff.current?.source === latest.current.source;
                if (wasCompatible) {
                    if(element.getAttribute('src'))handoff.current = { source: element.getAttribute('src') ?? '', track: latest.current.songKey, position: element.currentTime || 0 };
                    element.pause(); element.removeAttribute('src'); element.load();
                }
                owned = attachNativeAudioElement(element, native); adapter.current = owned;
                owned.configure(options.current);
                commitSource(); setReady(true);
                if (latest.current.source && ((wasCompatible && latest.current.playing)||autoplayIntent?.current) && !owned.snapshot().requestedPlaying) {
                    if(autoplayIntent)autoplayIntent.current=false;
                    const token=latest.current.attempt;
                    void element.play().catch(error=>{if(autoplayIntent&&latest.current.attempt===token&&error?.name==='AbortError')autoplayIntent.current=true;});
                }
            }
        };
        const installCompatible = () => {
            if(cancelled||!element.isConnected)return;
            audioRef.current=element;
            if (!own) {
                const current = latest.current, previous = handoff.current;
                if (requested && current.source) {
                    element.src = current.source;
                    element.addEventListener('loadedmetadata', () => {
                        if (cancelled || latest.current.attempt !== current.attempt || adapter.current) return;
                        if (previous?.source === current.source && previous.track === current.songKey && previous.position > 0) element.currentTime = previous.position;
                        const intent=usePlaybackStore.getState().playerState;
                        if (intent === PlayerState.PLAYING || (intent!==PlayerState.PAUSED&&previous?.requestedPlaying) || autoplayIntent?.current) {
                            if(autoplayIntent)autoplayIntent.current=false;
                            void element.play().catch(()=>{});
                        }
                    }, { once: true });
                    element.load();
                }
                setWebReady(true);
            }
        };
        const install = () => {
            if(cancelled)return;
            if(own&&supported===true){
                if(hasCompatibleSleepOutput())void releaseCompatibleSleepOutput().then(installNative).catch(()=>setStatusMessage({type:'error',text:'兼容通道未确认停止，已阻止启动原生内核'}));
                else installNative();
            }else if(!own){
                void ensureCompatibleSleepOutput(()=>latest.current.attempt,reason=>quietGraph.current?.(reason)??Promise.resolve(true)).then(installCompatible).catch(()=>setStatusMessage({type:'error',text:'兼容播放控制未就绪，请重试；定时暂停暂不可用'}));
            }
        };
        if (transfer.current) void transfer.current.then(install).catch(() => {}); else install();
        return () => {
            cancelled = true; setReady(false);setWebReady(false);
            if (!owned) return;
            handoff.current = owned.snapshot(); adapter.current = null;
            if (audioRef.current === element) audioRef.current = null;
            const stopping = owned.dispose(); transfer.current = stopping;
            void stopping.then(() => { if (transfer.current === stopping) transfer.current = null; })
                .catch(() => setStatusMessage({ type: 'error', text: '旧播放内核未确认停止，已阻止切换以避免双重播放' }));
        };
    }, [own, supported, activeDeck, audioRef, android, requested]);
    useEffect(()=>()=>{if(android)void releaseCompatibleSleepOutput().catch(()=>{});},[android]);
    useEffect(()=>{
        if(!webReady)return;
        const element=audioRef.current;if(!element)return;
        const remember=()=>{handoff.current={source:element.currentSrc||element.getAttribute('src')||'',track:latest.current.songKey,position:element.currentTime||0};};
        element.addEventListener('timeupdate',remember);element.addEventListener('pause',remember);
        return()=>{element.removeEventListener('timeupdate',remember);element.removeEventListener('pause',remember);};
    },[webReady,activeDeck,audioRef]);
    useLayoutEffect(() => { adapter.current?.configure({ fade, analysis, loop: loop === 'one', interactive: main || rear }); }, [fade, analysis, loop, main, rear, ready]);
    useLayoutEffect(commitSource, [source, songKey, generation, ready]);
    // React never assigns a browser src during an Android handoff. Detach is acknowledged first.
    useLayoutEffect(() => {
        if (!android || !requested || own || !webReady || transfer.current || adapter.current) return;
        const element = audioRef.current;
        if (element && source && element.getAttribute('src') !== source) { element.src = source; element.load(); }
    }, [source, own, webReady, android, requested, audioRef]);
    return { suppressBrowserSource: android && requested && (own || !webReady), nativeReady: own && ready };
}

import {buildRearAodTimeline} from '../../utils/rearAodTimeline';
import {subscribeVisualizerLowPowerCadence,setVisualizerLowPowerDemand,invalidateVisualizerLowPower} from '../../utils/visualizerFrameChannel';
import {reportRearAodFrames} from '../../services/rearAodDiagnostics';
import type {RearAodCadenceChange} from '../../utils/rearAodCadence';
import {useRearAod,isRearAod} from '../../services/rearAodRuntime';
import {useRearPreparing} from '../../services/rearPreparation';
import {MotionConfig} from 'framer-motion';
import { requestVisualizerAnimationFrame, cancelVisualizerAnimationFrame } from '../../utils/visualizerFrameChannel';
import { useRearStageActive } from '../../hooks/useStageActivity';
import { setGlobalVisualizerFrameRate } from '../../utils/frameRateLimiter';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMotionValue } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import VisualizerRenderer from '../visualizer/VisualizerRenderer';
import { NO_LYRIC_LINES } from '../../utils/lyrics/noLyricLines';
import { PlayerState } from '../../types';
import type { ObsBrowserSourceAudio, ObsBrowserSourceClock, ObsBrowserSourceConfig } from '../../types/obsBrowserSource';
import { findLatestActiveLineIndex } from '../../utils/appPlaybackHelpers';
import { buildObsBrowserSourceConfigSignature, resolveObsBrowserSourceClockTime } from '../../utils/obsBrowserSource';
import type { LyricsSurfaceTransport } from '../../types/lyricsSurfaceTransport';
import { getVisualizerSurface } from '../../utils/visualizerSurface';

// src/components/obs/ObsBrowserSourceApp.tsx
// Read-only OBS browser source renderer driven by Folia's main playback clock.

const EMPTY_SPECTRUM = new Uint8Array(0);

const buildEventSourceUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') ?? '';
    const devPort = params.get('obsPort');
    const baseUrl = devPort ? `http://127.0.0.1:${devPort}` : window.location.origin;
    const url = new URL('/obs/events', baseUrl);
    url.searchParams.set('token', token);
    return url.toString();
};

const ObsBrowserSourceApp: React.FC<{ transport?: LyricsSurfaceTransport; onConfigured?: () => void }> = ({ transport, onConfigured }) => {
    const aod=useRearAod();
    const { t } = useTranslation();
    const stageActive = useRearStageActive();
    const preparing = useRearPreparing();
    const surfaceActive = stageActive || preparing;
    const [config, setConfig] = useState<ObsBrowserSourceConfig | null>(null);
    const [connected, setConnected] = useState(false);
    const [currentLineIndex, setCurrentLineIndex] = useState(-1);
    const [playbackState, setPlaybackState] = useState<PlayerState>(PlayerState.IDLE);
    const [obsScale, setObsScale] = useState(1);
    const [obsDimensions, setObsDimensions] = useState({ width: '100vw', height: '100vh' });
    const currentLineIndexRef = useRef(-1);
    const monotonicClock=useRef({time:0,at:0,speed:1,playing:false});
    const clockRef = useRef<ObsBrowserSourceClock | null>(null);
    const refreshPausedClock = useRef<(() => void) | null>(null);
    const configRef = useRef<ObsBrowserSourceConfig | null>(null);
    const configSignatureRef = useRef<string | null>(null);
    const surfaceRef = useRef<HTMLDivElement>(null);
    const currentTime = useMotionValue(0);
    const updateStats=useRef({count:0,at:0});
    const audioPower = useMotionValue(0);
    const bass = useMotionValue(0);
    const lowMid = useMotionValue(0);
    const mid = useMotionValue(0);
    const vocal = useMotionValue(0);
    const treble = useMotionValue(0);
    const spectrum = useMotionValue(EMPTY_SPECTRUM);
    const audioBands = useMemo(() => ({
        bass,
        lowMid,
        mid,
        vocal,
        treble,
        spectrum,
    }), [bass, lowMid, mid, spectrum, treble, vocal]);

    useEffect(()=>{if(!aod)return;audioPower.set(0);bass.set(0);lowMid.set(0);mid.set(0);vocal.set(0);treble.set(0);spectrum.set(EMPTY_SPECTRUM);},[aod,audioPower,bass,lowMid,mid,vocal,treble,spectrum]);
    useEffect(() => {
        document.body.style.backgroundColor = 'transparent';
        document.documentElement.style.backgroundColor = 'transparent';
        document.body.style.overflow = 'hidden';
        document.title = 'Folia OBS';
    }, []);

    useEffect(() => {
        configRef.current = config;
    }, [config]);

    useEffect(() => {
        let isHandlingResize = false;
        
        const handleResize = () => {
            if (isHandlingResize) return;
            isHandlingResize = true;
            
            try {
                const isPortrait = window.innerHeight > window.innerWidth;
                const baseWidth = isPortrait ? 1080 : 1920;
                
                // The rear reading box is positioned by VisualizerShell; this root stays full-panel so a
                // surface offset is never applied a second time here.
                const realWidth = window.document.documentElement.clientWidth;
                const realHeight = window.document.documentElement.clientHeight;
                
                const scale = transport ? 1 : Math.max(1, realWidth / baseWidth);
                setObsScale(scale);
                setObsDimensions({
                    width: `${realWidth / scale}px`,
                    height: `${realHeight / scale}px`
                });

                // Globally override devicePixelRatio and window size for the OBS browser source.
                // This forces all child components to naturally render and layout exactly
                // as if they were in a 1920x1080 screen, while natively maintaining 4K text rasterization.
                if (!transport) try {
                    Object.defineProperty(window, 'devicePixelRatio', { get: () => scale, configurable: true });
                    Object.defineProperty(window, 'innerWidth', { get: () => realWidth / scale, configurable: true });
                    Object.defineProperty(window, 'innerHeight', { get: () => realHeight / scale, configurable: true });
                } catch {
                    // Ignore
                }
                
                // Force an event so any visualizer that caches window dimensions updates to the mocked size
                if (scale > 1.0) {
                    window.dispatchEvent(new Event('resize'));
                }
            } finally {
                isHandlingResize = false;
            }
        };
        handleResize();

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [transport]);

    useEffect(() => {
        if (transport) {
            return transport.subscribe({
                config: nextConfig => {
                    const signature = buildObsBrowserSourceConfigSignature(nextConfig);
                    if (signature === configSignatureRef.current) return;
                    configSignatureRef.current = signature;
                    setConfig(nextConfig);
                    if (transport) setGlobalVisualizerFrameRate(nextConfig.visualizerFrameRate ?? 60);
                },
                clock: nextClock => {
                    clockRef.current = nextClock;
                    const oldAnchor=monotonicClock.current,now=performance.now();
                    const incoming=resolveObsBrowserSourceClockTime(nextClock);
                    const predicted=oldAnchor.time+(oldAnchor.playing?Math.max(0,now-oldAnchor.at)/1000*oldAnchor.speed:0);
                    const visualChange=Math.abs(incoming-predicted)>.15||oldAnchor.playing!==(nextClock.playerState===PlayerState.PLAYING)||oldAnchor.speed!==nextClock.playbackRate;
                    monotonicClock.current={time:resolveObsBrowserSourceClockTime(nextClock),at:performance.now(),speed:nextClock.playbackRate||1,playing:nextClock.playerState===PlayerState.PLAYING};
                    if(isRearAod()&&visualChange){invalidateVisualizerLowPower();if(window.parent!==window)window.parent.dispatchEvent(new Event('folia-rear-visual-change'));}
                    refreshPausedClock.current?.();
                    setPlaybackState(previous => previous === nextClock.playerState ? previous : nextClock.playerState);
                },
                audio: nextAudio => {
                    if(isRearAod())return;
                    audioPower.set(nextAudio.audioPower);
                    bass.set(nextAudio.bands.bass); lowMid.set(nextAudio.bands.lowMid);
                    mid.set(nextAudio.bands.mid); vocal.set(nextAudio.bands.vocal); treble.set(nextAudio.bands.treble);
                    spectrum.set(new Uint8Array(nextAudio.spectrum));
                },
                connected: setConnected,
            });
        }
        const eventSource = new EventSource(buildEventSourceUrl());

        eventSource.onopen = () => setConnected(true);
        eventSource.onerror = () => setConnected(false);
        eventSource.addEventListener('config', event => {
            const nextConfig = JSON.parse((event as MessageEvent).data) as ObsBrowserSourceConfig;
            const nextSignature = buildObsBrowserSourceConfigSignature(nextConfig);
            if (nextSignature === configSignatureRef.current) return;
            configSignatureRef.current = nextSignature;
            setConfig(nextConfig);
        });
        eventSource.addEventListener('clock', event => {
            const nextClock = JSON.parse((event as MessageEvent).data) as ObsBrowserSourceClock;
            clockRef.current = nextClock;
            refreshPausedClock.current?.();
            setPlaybackState(prev => (
                prev === nextClock.playerState ? prev : nextClock.playerState
            ));
        });
        eventSource.addEventListener('audio', event => {
            const nextAudio = JSON.parse((event as MessageEvent).data) as ObsBrowserSourceAudio;
            audioPower.set(nextAudio.audioPower);
            bass.set(nextAudio.bands.bass);
            lowMid.set(nextAudio.bands.lowMid);
            mid.set(nextAudio.bands.mid);
            vocal.set(nextAudio.bands.vocal);
            treble.set(nextAudio.bands.treble);
            spectrum.set(new Uint8Array(nextAudio.spectrum));
        });

        return () => {
            eventSource.close();
        };
    }, [audioPower, bass, lowMid, mid, spectrum, treble, vocal, transport]);

    useEffect(() => {
        if (!config || !onConfigured || !surfaceActive) return;
        const confirm = () => {
            // A lazy mode must have mounted its shell/canvas before the native display can report success.
            if (surfaceRef.current?.querySelector('.font-sans, .font-serif, .font-mono, canvas')) {
                observer.disconnect(); onConfigured();
            }
        };
        // A hidden preparatory card may not receive rAF. This reports DOM preparation only;
        // native visual-state + onDraw remain mandatory before taking ownership.
        const observer = new MutationObserver(confirm);
        if (surfaceRef.current) observer.observe(surfaceRef.current, {childList:true,subtree:true});
        confirm();
        return () => observer.disconnect();
    }, [config, onConfigured, surfaceActive]);

    const aodTimeline=useMemo(()=>buildRearAodTimeline(config?.lyrics?.lines??[],config?.lyrics?.isWordByWord===true),[config?.lyrics]);
    useEffect(()=>{
        if(!aod||!surfaceActive)return;
        const demand=()=>{const clock=monotonicClock.current;return aodTimeline(clock.time+(clock.playing?Math.max(0,performance.now()-clock.at)/1000*clock.speed:0),clock.speed,clock.playing).delay;};
        updateStats.current={count:0,at:performance.now()};
        const report=(trigger:Parameters<typeof reportRearAodFrames>[0],change?:RearAodCadenceChange)=>{
            const anchor=monotonicClock.current;
            const time=anchor.time+(anchor.playing?Math.max(0,performance.now()-anchor.at)/1000*anchor.speed:0);
            reportRearAodFrames(trigger,configRef.current?.visualizerMode??'unknown',aodTimeline(time,anchor.speed,anchor.playing).fps,updateStats.current.count,0,change);
        };
        setVisualizerLowPowerDemand(demand);report('state-change');
        const stopCadence=subscribeVisualizerLowPowerCadence(change=>report(change.reason==='recovered'?'cadence-up':'cadence-down',change));
        const parent=window.parent;
        if(parent!==window)parent.dispatchEvent(new CustomEvent('folia-rear-demand',{detail:demand}));
        return()=>{stopCadence();setVisualizerLowPowerDemand(null);report('cancelled');if(parent!==window)parent.dispatchEvent(new CustomEvent('folia-rear-demand',{detail:null}));};
    },[aod,surfaceActive,aodTimeline]);
    useEffect(() => {
        if (!surfaceActive) return;
        let frameId = 0;
        const tick = () => {
            const anchor=monotonicClock.current;
            const lyricTime = aod?anchor.time+(anchor.playing?Math.max(0,performance.now()-anchor.at)/1000*anchor.speed:0):resolveObsBrowserSourceClockTime(clockRef.current);
            
            currentTime.set(lyricTime);
            if(aod){const now=performance.now(),stats=updateStats.current;stats.count++;
                if(now-stats.at>=30_000){
                    reportRearAodFrames('timeline',configRef.current?.visualizerMode??'unknown',aodTimeline(lyricTime,anchor.speed,anchor.playing).fps,stats.count,(now-stats.at)/Math.max(1,stats.count));stats.at=now;stats.count=0;
                }
            }

            const lines = configRef.current?.lyrics?.lines ?? [];
            const nextLineIndex = lines.length > 0 ? findLatestActiveLineIndex(lines, lyricTime) : -1;
            if (nextLineIndex !== currentLineIndexRef.current) {
                currentLineIndexRef.current = nextLineIndex;
                setCurrentLineIndex(nextLineIndex);
            }

            if (playbackState === PlayerState.PLAYING) frameId = requestVisualizerAnimationFrame(tick);
        };

        refreshPausedClock.current = playbackState === PlayerState.PLAYING ? null : tick;
        tick();
        if(aod)invalidateVisualizerLowPower();
        return () => { refreshPausedClock.current = null; cancelVisualizerAnimationFrame(frameId); };
    }, [currentTime, playbackState, surfaceActive, config,aod]);

    if (!config) {
        return (
            <div className="h-screen w-screen bg-transparent grid place-items-center text-white/70 text-sm">
                {connected ? t('obs.waitingForPlayback', 'Waiting for Folia playback') : t('obs.connecting', 'Connecting to Folia')}
            </div>
        );
    }

    const displayMode = config.visualizerMode;
    return (
        <div
            ref={surfaceRef}
            data-visualizer-mode={displayMode}
            className="overflow-hidden"
            style={{
                position: getVisualizerSurface() ? 'absolute' : undefined,
                left: getVisualizerSurface()?.left,
                top: getVisualizerSurface()?.top,
                overflow: getVisualizerSurface() ? 'visible' : 'hidden',
                width: obsDimensions.width,
                height: obsDimensions.height,
                zoom: obsScale,
                backgroundColor: config.background?.transparent ? 'transparent' : config.theme.backgroundColor,
                color: config.theme.primaryColor,
            }}
        >
            <MotionConfig reducedMotion={aod?"always":"user"}>{surfaceActive && <VisualizerRenderer
                mode={displayMode}
                visualizerTunings={config.visualizerTunings}
                currentTime={currentTime}
                currentLineIndex={currentLineIndex}
                lines={config.lyrics?.lines ?? NO_LYRIC_LINES}
                theme={config.theme}
                subtitleTheme={config.subtitleTheme}
                isDaylight={config.isDaylight}
                audioPower={audioPower}
                audioBands={audioBands}
                songTitle={config.song?.name}
                songArtist={config.songArtist}
                songAlbum={config.songAlbum}
                coverUrl={config.coverUrl}
                showText={true}
                seed={config.seed}
                staticMode={config.staticMode||aod}
                paused={playbackState !== PlayerState.PLAYING}
                visualizerOpacity={config.visualizerOpacity}
                background={config.background}
                lyricsFontScale={config.lyricsFontScale}
                subtitleFontScale={config.subtitleFontScale}
                subtitleOverlayOpacity={config.subtitleOverlayOpacity}
                subtitleOverlayBackground={config.subtitleOverlayBackground ?? true}
                subtitleUpcomingLyricsBlur={config.subtitleUpcomingLyricsBlur ?? true}
                showHarmonySubtitle={config.showHarmonySubtitle ?? true}
                harmonySubtitleBackground={config.harmonySubtitleBackground ?? true}
                isPlayerChromeHidden={true}
                hideTranslationSubtitle={config.hideTranslationSubtitle}
                showSubtitleTranslation={config.showSubtitleTranslation ?? true}
                subtitleContentMode={config.subtitleContentMode}
                cappellaCustomEmojiImages={config.cappellaCustomEmojiImages}
                cappellaCustomAvatarImages={config.cappellaCustomAvatarImages}
                monetPortraitImage={config.monetPortraitImage}
                temperaLayerImageAssets={config.temperaLayerImageAssets}
            />}</MotionConfig>
        </div>
    );
};

export default ObsBrowserSourceApp;

import {useRearInteractionStore} from '../stores/useRearInteractionStore';
import {useRearStageAppearanceStore} from '../stores/useRearStageAppearanceStore';
import {resolveRearStageConfig} from '../services/rearStageAppearance';
import {nativeAudioIdentity,compatibleOutputSession,compatibleOutputRequest} from '../services/playbackOutputIdentity';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ObsBrowserSourceAudio, ObsBrowserSourceClock, ObsBrowserSourceConfig } from '../types/obsBrowserSource';
import { useTypographySettingsStore } from '../stores/useTypographySettingsStore';
import { resolveRearUploadedFont, type RearUploadedFont } from '../services/rearLyricsFont';
import { createRearClockPublisher } from '../services/rearPlaybackClock';
import type { RearPlaybackClockReader } from '../types/rearLyricsClock';
import { Capacitor } from '@capacitor/core';
import { getFoliaNative } from '../platform/foliaNative';
import { PlayerState } from '../types';
import { setRearRuntime,useRearRuntimeStore } from '../stores/useRearRuntimeStore';
import {useSettingsModalStore} from '../stores/useSettingsModalStore';

type Plugin = {
    getRearLyricsStatus: () => Promise<{ enabled?: boolean; starting?: boolean; sleeping?: boolean; returnedToSystem?: boolean }>;
    getRearLyricsRuntimeState?: Plugin['getRearLyricsStatus'];
    publishRearLyricsSnapshot: (snapshot: unknown) => Promise<void>;
};

/** Relays Folia's actual style, full timed lyrics and audio instead of a separate text approximation. */
export function useRearLyricsPublisher(frontConfig: ObsBrowserSourceConfig, clock: () => ObsBrowserSourceClock,
    audio: () => ObsBrowserSourceAudio, readPlaybackClock: RearPlaybackClockReader) {
    const font = useTypographySettingsStore(state => state.lyricsCustomFont);
    const mode=useRearStageAppearanceStore(s=>s.mode),profile=useRearStageAppearanceStore(s=>s.profile),appearanceReady=useRearStageAppearanceStore(s=>s.ready);
    const tapControls=useRearInteractionStore(s=>s.tapControls);
    const config=useMemo(()=>({...resolveRearStageConfig(frontConfig,{version:1,mode,profile}),rearTapControls:tapControls}),[frontConfig,mode,profile,tapControls]);
    const rearEnabled=useRearRuntimeStore(s=>s.enabled),appearanceOpen=useSettingsModalStore(s=>!!s.settingsModalState.rearPage?.startsWith('appearance'));
    const [frontUploaded,setFrontUploaded]=useState<RearUploadedFont|null>(null);

    useEffect(()=>{let cancelled=false;if(Capacitor.getPlatform()!=='android'||!rearEnabled&&!appearanceOpen)return;void resolveRearUploadedFont(font?.source==='uploaded'?font.fontId??'':'').then(value=>{if(!cancelled)setFrontUploaded(value);});return()=>{cancelled=true;};},[font?.source,font?.fontId,rearEnabled,appearanceOpen]);
    useEffect(()=>{if(Capacitor.getPlatform()==='android')useRearStageAppearanceStore.getState().observeFront({...frontConfig,visualAssetsReady:frontConfig.visualAssetsReady!==false&&(font?.source!=='uploaded'||frontUploaded?.id===font.fontId)},frontUploaded);},[frontConfig,font,frontUploaded]);
    const rearFont=mode==='independent'?profile?.font??null:null;
    const latest = useRef({ config, clock, audio, font, readPlaybackClock,rearFont,mode,appearanceReady });
    const wake = useRef<() => void>(() => undefined);
    latest.current = { config, clock, audio, font, readPlaybackClock,rearFont,mode,appearanceReady };
    useEffect(() => {
        const capacitor = (window as any).Capacitor;
        if (Capacitor.getPlatform() !== 'android') return;
        const plugin = (capacitor?.Plugins?.FoliaNative ?? getFoliaNative<Plugin>()) as Plugin;
        if (!plugin?.publishRearLyricsSnapshot) return;
        const publisher = createRearClockPublisher();
        let closed = false, enabled = false, sleeping = false, polling = false, publishing = false;
        let statusTimer = 0, publishTimer = 0, fastStatus = Boolean(plugin.getRearLyricsRuntimeState);
        let lastClockKey = '', lastPublish = 0;
        let publishedConfig: ObsBrowserSourceConfig | null = null;let publishedSession='';
        let publishedFont = '';
        let loadedFontId: string | null = null;
        let loadedFont: RearUploadedFont | null = null;
        const poll = async () => {
            if (closed || polling) return;
            polling = true;
            try {
                const result = await (fastStatus ? plugin.getRearLyricsRuntimeState!().catch(() => {
                    fastStatus = false; return plugin.getRearLyricsStatus();
                }) : plugin.getRearLyricsStatus());
                if (!closed) {
                    const wasEnabled = enabled;
                    enabled = (result.enabled === true || result.starting === true) && result.returnedToSystem !== true;
                    sleeping = result.sleeping === true;
                    setRearRuntime(enabled, sleeping);
                    if (!enabled || sleeping) { clearTimeout(publishTimer); publishTimer = 0; }
                    else if (!wasEnabled || !publishTimer) schedulePublish(0);
                }
            } catch { /* A disconnected rear surface must not disturb playback. */ }
            finally {
                polling = false;
                if (!closed) statusTimer = window.setTimeout(() => void poll(), enabled ? 1000 : 2000);
            }
        };
        const schedulePublish = (delay: number) => {
            clearTimeout(publishTimer);
            publishTimer = window.setTimeout(() => { publishTimer = 0; void publish(); }, delay);
        };
        const publish = async () => {
            if (closed || !enabled || sleeping || publishing) return;
            publishing = true;
            const value = latest.current;
            if(!value.appearanceReady){void useRearStageAppearanceStore.getState().initialize();publishing=false;schedulePublish(1000);return;}
            let advancing = false;
            const fontId = value.mode==='independent'?value.rearFont?.id??'':value.font?.source === 'uploaded' ? value.font.fontId ?? '' : '';
            const live=value.readPlaybackClock();
            const identity=nativeAudioIdentity(live?.media??null);
            const session=identity?.sessionId ?? compatibleOutputSession();
            const binding=session+":"+(identity?.epoch??"");
            const changed = publishedConfig !== value.config || publishedFont !== fontId||publishedSession!==binding;
            try {
                const clock = {...publisher.sample(value.clock(), JSON.stringify([
                    value.config.activePlaybackContext, value.config.stageSource,
                    value.config.song?.id, value.config.song?.name, value.config.songArtist,
                ]), live),playbackSessionId:session,playbackSongKey:value.config.playbackSongKey,playbackEpoch:identity?.epoch,requestId:compatibleOutputRequest()};
                advancing = clock.playerState === PlayerState.PLAYING && !sleeping;
                const clockKey = JSON.stringify([clock.timelineId, clock.discontinuity, clock.currentTime,
                    clock.duration, clock.playerState, clock.playbackRate, clock.lyricOffsetMs]);
                // Keep a sparse heartbeat for reconnecting surfaces; seek/config/state changes publish immediately on this tick.
                if (!changed && !advancing && clockKey === lastClockKey && Date.now() - lastPublish < 5000) return;
                if (loadedFontId !== fontId) {
                    loadedFont = value.mode==='independent'?value.rearFont:await resolveRearUploadedFont(fontId);
                    loadedFontId = fontId;
                }
                if (closed || sleeping || !enabled || value !== latest.current) return;
                await plugin.publishRearLyricsSnapshot({
                    ...(changed ? { config: {...value.config,playbackSessionId:session,playbackEpoch:identity?.epoch}, uploadedFont: loadedFont } : {}),
                    clock, audio: value.audio(),
                });
                publishedConfig = value.config; publishedFont = fontId;publishedSession=binding;
                lastClockKey = clockKey; lastPublish = Date.now();
            } catch { /* Retry a dropped update on the next tick. */ }
            finally { publishing = false; if (!closed && enabled && !sleeping) schedulePublish(advancing ? 100 : 1000); }
        };
        const refresh = () => { clearTimeout(statusTimer); void poll(); };
        const visible = () => { if (!document.hidden) refresh(); };
        wake.current = () => {
            if (closed || sleeping) return;
            if (!enabled) refresh();
            else if (!publishing) schedulePublish(0);
        };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', visible);
        void poll();
        return () => {
            closed = true; clearTimeout(statusTimer); clearTimeout(publishTimer); publisher.dispose();
            window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible);
            setRearRuntime(false, false);
            wake.current = () => undefined;
        };
    }, []);
    useEffect(() => { wake.current(); }, [config, clock, font,appearanceReady]);
}

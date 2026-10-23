import { useEffect, useRef } from 'react';
import type { ObsBrowserSourceAudio, ObsBrowserSourceClock, ObsBrowserSourceConfig } from '../types/obsBrowserSource';
import { useTypographySettingsStore } from '../stores/useTypographySettingsStore';
import { resolveRearUploadedFont, type RearUploadedFont } from '../services/rearLyricsFont';
import { createRearClockPublisher } from '../services/rearPlaybackClock';
import type { RearPlaybackClockReader } from '../types/rearLyricsClock';
import { Capacitor } from '@capacitor/core';
import { getFoliaNative } from '../platform/foliaNative';

type Plugin = {
    getRearLyricsStatus: () => Promise<{ enabled?: boolean; starting?: boolean; sleeping?: boolean }>;
    publishRearLyricsSnapshot: (snapshot: unknown) => Promise<void>;
};

/** Relays Folia's actual style, full timed lyrics and audio instead of a separate text approximation. */
export function useRearLyricsPublisher(config: ObsBrowserSourceConfig, clock: () => ObsBrowserSourceClock,
    audio: () => ObsBrowserSourceAudio, readPlaybackClock: RearPlaybackClockReader) {
    const font = useTypographySettingsStore(state => state.lyricsCustomFont);
    const latest = useRef({ config, clock, audio, font, readPlaybackClock });
    latest.current = { config, clock, audio, font, readPlaybackClock };
    useEffect(() => {
        const capacitor = (window as any).Capacitor;
        if (Capacitor.getPlatform() !== 'android') return;
        const plugin = (capacitor?.Plugins?.FoliaNative ?? getFoliaNative<Plugin>()) as Plugin;
        if (!plugin?.publishRearLyricsSnapshot) return;
        const publisher = createRearClockPublisher();
        let closed = false, enabled = false, sleeping = false, polling = false, publishing = false, lastPublish = 0;
        let publishedConfig: ObsBrowserSourceConfig | null = null;
        let publishedFont = '';
        let loadedFontId: string | null = null;
        let loadedFont: RearUploadedFont | null = null;
        const poll = async () => {
            if (polling) return;
            polling = true;
            try {
                const result = await plugin.getRearLyricsStatus();
                if (!closed) { enabled = result.enabled === true || result.starting === true; sleeping = result.sleeping === true; }
            } catch { /* A disconnected rear surface must not disturb playback. */ }
            finally { polling = false; }
        };
        const publish = async () => {
            if (closed || !enabled || publishing) return;
            if (sleeping && Date.now() - lastPublish < 1000) return;
            lastPublish = Date.now();
            publishing = true;
            const value = latest.current;
            const fontId = value.font?.source === 'uploaded' ? value.font.fontId ?? '' : '';
            const changed = publishedConfig !== value.config || publishedFont !== fontId;
            try {
                if (loadedFontId !== fontId) {
                    loadedFont = await resolveRearUploadedFont(fontId);
                    loadedFontId = fontId;
                }
                if (closed) return;
                await plugin.publishRearLyricsSnapshot({
                    ...(changed ? { config: value.config, uploadedFont: loadedFont } : {}),
                    clock: publisher.sample(value.clock(), JSON.stringify([
                        value.config.activePlaybackContext, value.config.stageSource,
                        value.config.song?.id, value.config.song?.name, value.config.songArtist,
                    ]), value.readPlaybackClock()), audio: value.audio(),
                });
                publishedConfig = value.config; publishedFont = fontId;
            } catch { /* Retry a dropped update on the next tick. */ }
            finally { publishing = false; }
        };
        void poll();
        const statusTimer = window.setInterval(() => void poll(), 700);
        const publishTimer = window.setInterval(() => void publish(), 100);
        return () => { closed = true; clearInterval(statusTimer); clearInterval(publishTimer); publisher.dispose(); };
    }, []);
}

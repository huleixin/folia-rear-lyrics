import type { LyricsSurfaceTransport } from '../types/lyricsSurfaceTransport';
import type { ObsBrowserSourceClock, ObsBrowserSourceConfig } from '../types/obsBrowserSource';
import { createRearClockSynchronizer } from '../utils/rearLyricsClock';

// Intercepted inside the rear WebView, not a network server or an external app.
export const REAR_STATE_PATH = '/__folia_rear/state';
export function createRearLyricsTransport(onClock: (clock: ObsBrowserSourceClock) => void, onConfig: (config: ObsBrowserSourceConfig) => void, loadFont = true): LyricsSurfaceTransport {
    return { subscribe(events) {
        let closed = false, sleeping = false, polling = false, timer = 0, revision = -1, fontId = '', connected = false;
        let ownedFont: FontFace | null = null;
        const abort = new AbortController();
        const synchronizer = createRearClockSynchronizer();
        const poll = async () => {
            if (closed || sleeping || polling) return;
            polling = true;
            try {
                const response = await fetch(`${REAR_STATE_PATH}?revision=${revision}`, { cache: 'no-store', signal: abort.signal });
                if (!response.ok) throw new Error(`Rear state ${response.status}`);
                const snapshot = await response.json();
                if (closed) return;
                if (snapshot.config) {
                    const font = snapshot.uploadedFont;
                    if (loadFont && font?.id && font.id !== fontId) {
                        try {
                            const next = await new FontFace(font.family, `url("${font.url}")`).load();
                            if (closed) return;
                            if (ownedFont) document.fonts.delete(ownedFont);
                            document.fonts.add(next); ownedFont = next; fontId = font.id;
                        } catch { /* Keep the configured fallback font if a font file cannot be loaded. */ }
                    } else if (!font && ownedFont) {
                        document.fonts.delete(ownedFont); ownedFont = null; fontId = '';
                    }
                    if (closed) return;
                    events.config(snapshot.config); onConfig(snapshot.config);
                    revision = snapshot.revision;
                }
                if (snapshot.clock) {
                    const clock = synchronizer.accept(snapshot.clock);
                    events.clock(clock); onClock(clock);
                }
                if (snapshot.audio) events.audio(snapshot.audio);
                if (!connected) { connected = true; events.connected(true); }
            } catch {
                if (connected && !closed) { connected = false; events.connected(false); }
            } finally { polling = false; if (!closed && !sleeping) timer = window.setTimeout(() => void poll(), 100); }
        };
        const power = (event: Event) => {
            sleeping = (event as CustomEvent<{ sleeping: boolean }>).detail?.sleeping === true;
            clearTimeout(timer);
            if (!sleeping) void poll();
        };
        window.addEventListener('folia-rear-power', power);
        void poll();
        return () => { closed = true; abort.abort(); clearTimeout(timer); window.removeEventListener('folia-rear-power', power); if (ownedFont) document.fonts.delete(ownedFont); };
    } };
}

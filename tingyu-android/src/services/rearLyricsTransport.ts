import type { LyricsSurfaceTransport } from '../types/lyricsSurfaceTransport';
import type { ObsBrowserSourceClock, ObsBrowserSourceConfig } from '../types/obsBrowserSource';
import { createRearClockSynchronizer } from '../utils/rearLyricsClock';
import type { RearSnapshotReceiver, RearStateSnapshot } from './rearStateRelay';

// Intercepted inside the rear WebView, not a network server or an external app.
export const REAR_STATE_PATH = '/__folia_rear/state';
export function createRearLyricsTransport(onClock: (clock: ObsBrowserSourceClock) => void, onConfig: (config: ObsBrowserSourceConfig) => void, loadFont = true,
    options: { onSnapshot?: (snapshot: RearStateSnapshot) => void; receiveSnapshots?: RearSnapshotReceiver } = {}): LyricsSurfaceTransport {
    return { subscribe(events) {
        let closed = false, sleeping = false, polling = false, timer = 0, revision = -1, fontId = '', connected = false;
        let ownedFont: FontFace | null = null;
        const abort = new AbortController();
        const synchronizer = createRearClockSynchronizer();
        let receiveCleanup: (() => void) | undefined, pending: RearStateSnapshot | null = null, consuming = false;
        const setConnected = (value: boolean) => { if (!closed && connected !== value) { connected = value; events.connected(value); } };
        const accept = async (snapshot: RearStateSnapshot) => {
                if (closed || sleeping) return;
                if (snapshot.config && snapshot.revision !== revision) {
                    const font = snapshot.uploadedFont;
                    if (loadFont && font?.id && font.id !== fontId) {
                        try {
                            const next = await new FontFace(font.family, `url("${font.url}")`).load();
                            if (closed || sleeping) return;
                            if (ownedFont) document.fonts.delete(ownedFont);
                            document.fonts.add(next); ownedFont = next; fontId = font.id;
                        } catch { /* Keep the configured fallback font if a font file cannot be loaded. */ }
                    } else if (!font && ownedFont) {
                        document.fonts.delete(ownedFont); ownedFont = null; fontId = '';
                    }
                    if (closed || sleeping) return;
                    events.config(snapshot.config); onConfig(snapshot.config);
                    revision = snapshot.revision;
                }
                if (snapshot.clock) {
                    const clock = synchronizer.accept(snapshot.clock);
                    events.clock(clock); onClock(clock);
                }
                if (snapshot.audio) events.audio(snapshot.audio);
        };
        const receive = async (snapshot: RearStateSnapshot) => {
            if (closed || sleeping) return;
            // Coalesce clocks while a font loads, retaining any new configuration in that batch.
            pending = { ...pending, ...snapshot };
            if (consuming) return;
            consuming = true;
            try { while (pending && !closed && !sleeping) { const next = pending; pending = null; await accept(next); } }
            catch { setConnected(false); }
            finally { consuming = false; }
        };
        const poll = async () => {
            if (closed || sleeping || polling) return;
            polling = true;
            try {
                const response = await fetch(`${REAR_STATE_PATH}?revision=${revision}`, { cache: 'no-store', signal: abort.signal });
                if (!response.ok) throw new Error(`Rear state ${response.status}`);
                const snapshot: RearStateSnapshot = await response.json();
                if (closed || sleeping) return;
                options.onSnapshot?.(snapshot);
                await accept(snapshot);
                if (!sleeping) setConnected(true);
            } catch { setConnected(false); }
            finally { polling = false; if (!closed && !sleeping) timer = window.setTimeout(() => void poll(), 100); }
        };
        const start = () => {
            if (options.receiveSnapshots) receiveCleanup = options.receiveSnapshots(value => void receive(value), setConnected);
            else void poll();
        };
        const power = (event: Event) => {
            sleeping = (event as CustomEvent<{ sleeping: boolean }>).detail?.sleeping === true;
            clearTimeout(timer);
            receiveCleanup?.(); receiveCleanup = undefined; pending = null;
            if (!sleeping) start();
        };
        window.addEventListener('folia-rear-power', power);
        start();
        return () => { closed = true; receiveCleanup?.(); abort.abort(); clearTimeout(timer); window.removeEventListener('folia-rear-power', power); if (ownedFont) document.fonts.delete(ownedFont); };
    } };
}

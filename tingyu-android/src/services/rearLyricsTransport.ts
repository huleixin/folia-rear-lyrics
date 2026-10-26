import type { LyricsSurfaceTransport } from '../types/lyricsSurfaceTransport';
import { PlayerState } from '../types';
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
        let lastClock: ObsBrowserSourceClock | null = null, lastAudioAt: number | undefined;
        let lastSnapshotKey = '';
        const inactive = () => sleeping || (typeof document !== 'undefined' && document.hidden);
        const abort = new AbortController();
        const synchronizer = createRearClockSynchronizer();
        let receiveCleanup: (() => void) | undefined, pending: RearStateSnapshot | null = null, consuming = false;
        const setConnected = (value: boolean) => { if (!closed && connected !== value) { connected = value; events.connected(value); } };
        const accept = async (snapshot: RearStateSnapshot) => {
                if (closed || inactive()) return;
                if (snapshot.config && snapshot.revision !== revision) {
                    const font = snapshot.uploadedFont;
                    if (loadFont && font?.id && font.id !== fontId) {
                        try {
                            const next = await new FontFace(font.family, `url("${font.url}")`).load();
                            if (closed || inactive()) return;
                            if (ownedFont) document.fonts.delete(ownedFont);
                            document.fonts.add(next); ownedFont = next; fontId = font.id;
                        } catch { /* Keep the configured fallback font if a font file cannot be loaded. */ }
                    } else if (!font && ownedFont) {
                        document.fonts.delete(ownedFont); ownedFont = null; fontId = '';
                    }
                    if (closed || inactive()) return;
                    events.config(snapshot.config); onConfig(snapshot.config);
                    revision = snapshot.revision;
                }
                if (snapshot.clock) {
                    const clock = synchronizer.accept(snapshot.clock);
                    if (clock !== lastClock) { lastClock = clock; events.clock(clock); onClock(clock); }
                }
                if (snapshot.audio && (snapshot.audio.sentAtMs === undefined || snapshot.audio.sentAtMs !== lastAudioAt)) {
                    lastAudioAt = snapshot.audio.sentAtMs; events.audio(snapshot.audio);
                }
        };
        const receive = async (snapshot: RearStateSnapshot) => {
            if (closed || inactive()) return;
            // Coalesce clocks while a font loads, retaining any new configuration in that batch.
            pending = { ...pending, ...snapshot };
            if (consuming) return;
            consuming = true;
            try { while (pending && !closed && !inactive()) { const next = pending; pending = null; await accept(next); } }
            catch { setConnected(false); }
            finally { consuming = false; }
        };
        const poll = async () => {
            if (closed || inactive() || polling) return;
            polling = true;
            try {
                const response = await fetch(`${REAR_STATE_PATH}?revision=${revision}`, { cache: 'no-store', signal: abort.signal });
                if (!response.ok) throw new Error(`Rear state ${response.status}`);
                const snapshot: RearStateSnapshot = await response.json();
                if (closed || inactive()) return;
                // The native endpoint can return the same packet many times while paused. Do not
                // copy it into the iframe, allocate spectra or notify React again without a change.
                const key = JSON.stringify([snapshot.revision, snapshot.clock, snapshot.audio?.sentAtMs]);
                if (key !== lastSnapshotKey) {
                    options.onSnapshot?.(snapshot); await accept(snapshot); lastSnapshotKey = key;
                }
                if (!inactive()) setConnected(true);
            } catch { setConnected(false); }
            finally { polling = false; if (!closed && !inactive()) timer = window.setTimeout(() => void poll(), lastClock?.playerState === PlayerState.PLAYING ? 100 : 250); }
        };
        const start = () => {
            if (closed || inactive()) return;
            if (options.receiveSnapshots) receiveCleanup = options.receiveSnapshots(value => void receive(value), setConnected);
            else void poll();
        };
        const refresh = () => {
            clearTimeout(timer);
            receiveCleanup?.(); receiveCleanup = undefined; pending = null;
            if (!inactive()) start();
        };
        const power = (event: Event) => {
            sleeping = (event as CustomEvent<{ sleeping: boolean }>).detail?.sleeping === true;
            refresh();
        };
        window.addEventListener('folia-rear-power', power);
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', refresh);
        start();
        return () => { closed = true; receiveCleanup?.(); abort.abort(); clearTimeout(timer); window.removeEventListener('folia-rear-power', power); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', refresh); if (ownedFont) document.fonts.delete(ownedFont); };
    } };
}

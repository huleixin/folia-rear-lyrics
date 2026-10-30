import type { LyricsSurfaceTransport } from '../types/lyricsSurfaceTransport';
import { PlayerState, type LyricData } from '../types';
import type { ObsBrowserSourceClock, ObsBrowserSourceConfig } from '../types/obsBrowserSource';
import { createRearClockSynchronizer } from '../utils/rearLyricsClock';
import type { RearSnapshotReceiver, RearStateSnapshot } from './rearStateRelay';

// Intercepted inside the rear WebView, not a network server or an external app.
export const REAR_STATE_PATH = '/__folia_rear/state';
export const REAR_LYRICS_PATH = '/__folia_rear/lyrics';
export const REAR_TRACE_PATH = '/__folia_rear/trace';
/**
 * A clock older than this is not "paused", it is "nobody is publishing any more": the foreground
 * WebView that owns the media clock is frozen (main screen locked / app in the background). Past
 * this point the native track snapshot owns the timeline instead of extrapolating the old one.
 */
export const NATIVE_STALE_MS = 2500;
const NATIVE_LYRIC_RETRIES = 8;
const NATIVE_LYRIC_RETRY_MS = 1500;
// 快重试耗尽后的慢速恢复：真机 2026-10-31 里歌词在切歌 12 秒后才补到背屏（锁屏链路慢），
// 旧实现 8 次×1.5s 用完就永远停在 loading。慢速档有界（4 次×5s），不做高频轮询，
// 到顶就接受现实（留白），绝不无限等。
const NATIVE_LYRIC_SLOW_RETRIES = 4;
const NATIVE_LYRIC_SLOW_RETRY_MS = 5000;
const NATIVE_LYRIC_MAX_ATTEMPTS = NATIVE_LYRIC_RETRIES + NATIVE_LYRIC_SLOW_RETRIES;

export type RearNativeTrack = {
    songKey?: string;
    epoch?: string;
    title?: string;
    artist?: string;
    durationMs?: number;
    positionMs?: number;
    playing?: boolean;
};

type NativeLyricResult = { state?: string; lines?: LyricData['lines'] };

export function createRearLyricsTransport(onClock: (clock: ObsBrowserSourceClock) => void, onConfig: (config: ObsBrowserSourceConfig) => void, loadFont = true,
    options: { onSnapshot?: (snapshot: RearStateSnapshot) => void; receiveSnapshots?: RearSnapshotReceiver } = {}): LyricsSurfaceTransport {
    return { subscribe(events) {
        let closed = false, sleeping = false, polling = false, timer = 0, revision = -1, fontId = '', connected = false;
        let ownedFont: FontFace | null = null;
        let lastClock: ObsBrowserSourceClock | null = null, lastAudioAt: number | undefined;
        let lastSnapshotKey = '';
        // The last configuration this document rendered. A track change patches this object
        // instead of waiting for a new one, so the visual settings never flicker or reset.
        let lastConfig: ObsBrowserSourceConfig | null = null;
        let appliedEpoch = '';
        let lyricRetry = 0;
        // 当前生效的原生轨与歌词链路状态：断连/恢复（refresh）时用于判断要不要续上
        // 还没拿到的歌词 —— 只续有界的剩余次数，不重置计数、不轮询。
        let activeTrack: RearNativeTrack | null = null;
        let lyricAttempt = 0;
        let lyricLines = 0;
        const inactive = () => sleeping || (typeof document !== 'undefined' && document.hidden);
        const abort = new AbortController();
        const synchronizer = createRearClockSynchronizer();
        let receiveCleanup: (() => void) | undefined, pending: RearStateSnapshot | null = null, consuming = false;
        // One file on the native side holds Media3's current song, the native lyric result and
        // what this renderer actually drew. Repeats are dropped so a frozen rear WebView cannot
        // fill the trace with the same line a hundred times a second.
        let traced: string[] = [];
        const trace = (event: string, detail: string) => {
            const id = `${event}|${detail}`;
            if (traced.includes(id)) return;
            traced.push(id);
            if (traced.length > 24) traced = traced.slice(-24);
            // An image beacon, not fetch: diagnostics must never be counted as a state request,
            // nor compete with the poll that decides whether the rear surface has live data.
            try {
                const beacon = new Image();
                beacon.src = `${REAR_TRACE_PATH}?event=${encodeURIComponent(event)}`
                    + `&detail=${encodeURIComponent(detail.slice(0, 180))}`;
            } catch { /* A renderer that cannot report still has to render. */ }
        };
        const setConnected = (value: boolean) => { if (!closed && connected !== value) { connected = value; events.connected(value); } };
        const emitConfig = (config: ObsBrowserSourceConfig) => {
            if (closed || inactive()) return;
            lastConfig = config; events.config(config); onConfig(config);
        };
        /**
         * Swap the lyric timeline to the native one for this exact epoch. The first patch carries
         * an EMPTY line list on purpose: showing the previous song's last line while a new track
         * starts is the bug this removes, so "loading" must look like nothing, never like old lyrics.
         */
        const applyNativeTrack = (track: RearNativeTrack) => {
            const base = lastConfig;
            if (!base) return;
            activeTrack = track;
            lyricLines = 0;
            emitConfig({
                ...base,
                song: { id: track.songKey ?? '', name: track.title || base.song?.name || '' },
                songArtist: track.artist ?? base.songArtist,
                hasTrack: true,
                lyrics: { lines: [], title: track.title, artist: track.artist },
                updatedAt: Date.now(),
            });
            void loadNativeLyrics(track, 0);
        };
        const loadNativeLyrics = async (track: RearNativeTrack, attempt: number) => {
            if (closed || appliedEpoch !== track.epoch) return;
            lyricAttempt = attempt;
            const positionMs = Math.round(track.positionMs ?? 0);
            trace('lyric-request', `song=${track.songKey ?? ''} epoch=${track.epoch ?? ''}`
                + ` attempt=${attempt} pos=${positionMs}`);
            let result: NativeLyricResult | null = null;
            try {
                const response = await fetch(`${REAR_LYRICS_PATH}?key=${encodeURIComponent(track.songKey ?? '')}`
                    + `&epoch=${encodeURIComponent(track.epoch ?? '')}`, { cache: 'no-store', signal: abort.signal });
                if (response.ok) result = await response.json();
            } catch { result = null; }
            if (closed || appliedEpoch !== track.epoch) return;
            const state = result?.state ?? 'loading';
            const lineCount = state === 'ready' && Array.isArray(result?.lines) ? result!.lines!.length : 0;
            trace('lyric-delivered', `song=${track.songKey ?? ''} epoch=${track.epoch ?? ''}`
                + ` attempt=${attempt} state=${state} lines=${lineCount}`);
            if (state === 'stale') return;
            if (state === 'loading' && attempt < NATIVE_LYRIC_MAX_ATTEMPTS) {
                // The native fetcher may still be downloading this track: poll a bounded number
                // of times (fast first, then a slow recovery tier) instead of holding a line from
                // the previous song on screen — and never forever.
                if (!lyricRetry) lyricRetry = window.setTimeout(() => {
                    lyricRetry = 0; void loadNativeLyrics(track, attempt + 1);
                }, attempt < NATIVE_LYRIC_RETRIES ? NATIVE_LYRIC_RETRY_MS : NATIVE_LYRIC_SLOW_RETRY_MS);
                return;
            }
            if (state === 'loading') {
                trace('lyric-timeout', `song=${track.songKey ?? ''} epoch=${track.epoch ?? ''}`
                    + ` attempts=${NATIVE_LYRIC_MAX_ATTEMPTS} pos=${positionMs}`);
            }
            const base = lastConfig;
            if (!base) return;
            emitConfig({
                ...base,
                lyrics: {
                    lines: lineCount > 0 ? result!.lines! : [],
                    title: track.title, artist: track.artist,
                },
                updatedAt: Date.now(),
            });
            lyricLines = lineCount;
            trace('render', `song=${track.songKey ?? ''} epoch=${track.epoch ?? ''} state=${state}`
                + ` lines=${lineCount}`);
        };
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
                    lastConfig = snapshot.config;
                    revision = snapshot.revision;
                }
                // The native side is the identity authority: Media3's current MediaItem id and a
                // per-track epoch. A different epoch means the song really changed, whatever the
                // (possibly frozen) foreground WebView last said.
                const track = snapshot.track;
                const sentAt = snapshot.clock?.sentAtMs ?? 0;
                const jsFresh = sentAt > 0 && Date.now() - sentAt <= NATIVE_STALE_MS;
                if (track?.epoch && track.epoch !== appliedEpoch) {
                    const previous = appliedEpoch;
                    appliedEpoch = track.epoch;
                    clearTimeout(lyricRetry); lyricRetry = 0;
                    trace('switch', `${previous || '(none)'} -> ${track.epoch} song=${track.songKey ?? ''}`
                        + ` pos=${Math.round(track.positionMs ?? 0)} playing=${track.playing === true}`
                        + ` source=${jsFresh ? 'webview' : 'native'}`);
                    // While the foreground WebView still publishes, it already knows this song and
                    // its lyrics are richer (word-by-word, translations); only take over when it
                    // has gone quiet. No downgrade, no flicker in the normal case.
                    if (!jsFresh) applyNativeTrack(track);
                }
                if (snapshot.clock && (jsFresh || !track?.epoch)) {
                    // Without a native track there is nothing better than the published clock, so
                    // an old snapshot keeps its previous meaning. With one, only a fresh clock
                    // (the foreground WebView is alive) is trusted.
                    trace('clock', 'source=webview');
                    const clock = synchronizer.accept(snapshot.clock);
                    if (clock !== lastClock) { lastClock = clock; events.clock(clock); onClock(clock); }
                } else if (track?.epoch) {
                    // Native clock: extrapolated natively from the real Media3 position, so the
                    // playhead keeps running while the foreground WebView is frozen and restarts
                    // at zero for the new song instead of continuing past the previous one's end.
                    const nativeClock = synchronizer.accept({
                        currentTime: (track.positionMs ?? 0) / 1000,
                        duration: (track.durationMs ?? 0) / 1000,
                        playerState: track.playing ? PlayerState.PLAYING : PlayerState.PAUSED,
                        sentAtMs: Date.now(),
                        playbackRate: 1,
                        lyricOffsetMs: lastClock?.lyricOffsetMs ?? 0,
                        timelineId: `native:${track.songKey ?? ''}`,
                        discontinuity: `native:${track.epoch}`,
                    });
                    if (nativeClock !== lastClock) { lastClock = nativeClock; events.clock(nativeClock); onClock(nativeClock); }
                    trace('clock', `source=native epoch=${track.epoch}`);
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
                // The native track is part of the key: it is the one field that still moves while
                // the foreground WebView is frozen, and skipping it would keep the old lyrics.
                const key = JSON.stringify([snapshot.revision, snapshot.clock, snapshot.audio?.sentAtMs,
                    snapshot.track?.epoch, snapshot.track?.positionMs, snapshot.track?.playing]);
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
            if (!inactive()) {
                // 恢复（visibilitychange / power / 重连）时，如果这首歌的歌词一次都没到过
                // 且重试预算还有剩，就从慢速档续上 —— 真机 2026-10-31：锁屏切歌后歌词
                // 12 秒才补到，旧链路此时早已放弃，只能靠点亮主屏救回。
                if (activeTrack && appliedEpoch === activeTrack.epoch && !lyricRetry
                    && lyricLines === 0 && lyricAttempt < NATIVE_LYRIC_MAX_ATTEMPTS) {
                    lyricRetry = window.setTimeout(() => {
                        lyricRetry = 0;
                        const track = activeTrack;
                        if (track) void loadNativeLyrics(track, lyricAttempt + 1);
                    }, NATIVE_LYRIC_SLOW_RETRY_MS);
                }
                start();
            }
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

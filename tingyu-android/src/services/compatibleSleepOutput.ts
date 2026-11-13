import {setCompatibleOutputSession} from './playbackOutputIdentity';
import { getTingyuPlayback } from '../platform/tingyuPlayback';
import { isNativeAudioElement } from './nativeAudioElement';
import { usePlaybackStore,selectDisplaySong } from '../stores/usePlaybackStore';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { PlayerState } from '../types';
import { setStatusMessage } from '../stores/useStatusMessageStore';
import { markProgrammaticPause } from './playbackFade';
import { resolvePlaybackSongArtist } from '../utils/playbackSongMeta';

// src/services/compatibleSleepOutput.ts
// Accepted output identity and event-based clock anchors; no JS timer or independent lyric clock.
interface Port { compatiblePlayback(options: Record<string, unknown>): Promise<{ accepted: boolean; blocked?: boolean; pausePending?: boolean }> }
type Endpoint = (lease: string, action: string, ticket: number, enabled: boolean) => boolean;
declare global { interface Window { __tingyuSleepOutput?: Endpoint } }
let owner: { lease: string; ready: Promise<void>; release(): Promise<void> } | null = null;
export const hasCompatibleSleepOutput = () => owner !== null;
export const compatibleOutputSession = () => owner?.lease ?? "";
const browserAudio = () => [...document.querySelectorAll('audio')].filter(element => !isNativeAudioElement(element));
export function pauseCompatibleAudio(allowEmpty = false, preserveIntent = false): boolean {
    const elements = browserAudio();
    for (const element of elements) {if(preserveIntent&&!element.paused)markProgrammaticPause(element);element.pause();}
    return (allowEmpty || elements.length > 0) && elements.every(element => element.paused);
}
export function ensureCompatibleSleepOutput(attempt: () => string, quietGraph: (reason:'timer'|'handoff') => Promise<boolean> = async()=>true): Promise<void> {
    if (owner) return owner.ready;
    const native = getTingyuPlayback<Port>(), lease = crypto.randomUUID();
    let revision = 0, live = true, barrier = false;
    let serial: Promise<unknown> = Promise.resolve();
    const loops = new Map<HTMLAudioElement, boolean>();
    const applyBarrier = () => {
        for (const element of browserAudio()) {
            if (barrier) { if (!loops.has(element)) loops.set(element, element.loop); element.loop = false; }
            else if (loops.has(element)) { element.loop = loops.get(element)!; loops.delete(element); }
        }
    };
    const endpoint: Endpoint = (token, action, ticket, enabled) => {
        if (!live || token !== lease) return false;
        if (action === 'barrier') { barrier = enabled; applyBarrier(); return true; }
        if (action !== 'pause') return false;
        // Revalidate natively before touching output: an eval queued while frozen can be stale.
        void send('pause-check',{ticket}).then(async value=>{
            if(!live||!value.accepted)return;
            let paused=pauseCompatibleAudio();
            if(paused)usePlaybackStore.getState().setPlayerState(PlayerState.PAUSED);
            paused=(await quietGraph('timer'))&&paused&&browserAudio().every(element=>element.paused);
            return send('pause-ack',{ticket,paused});
        }).catch(()=>{});
        return true; // Dispatch only; native completion requires the separate pause-ack.
    };
    window.__tingyuSleepOutput = endpoint;
    const send = (action: string, extra: Record<string, unknown> = {}) => {
        const state = usePlaybackStore.getState();
        const displaySong=selectDisplaySong(state);
        const outgoing=displaySong&&state.currentSong&&getPlaybackSongKey(displaySong)!==getPlaybackSongKey(state.currentSong);
        const bound=!!state.audioSrc&&browserAudio().some(audio=>audio.currentSrc===state.audioSrc||audio.getAttribute('src')===state.audioSrc);
        const mixed=outgoing&&browserAudio().some(audio=>!audio.paused&&!audio.ended);
        const elements = browserAudio();
        const candidates = outgoing ? elements.filter(audio => !audio.paused && !audio.ended && audio.currentSrc !== state.audioSrc)
            : elements.filter(audio => audio.currentSrc === state.audioSrc || audio.getAttribute('src') === state.audioSrc);
        const audio = candidates.length === 1 ? candidates[0] : undefined;
        const clock = audio && Number.isFinite(audio.currentTime) ? { positionMs: audio.currentTime * 1000,
            durationMs: Number.isFinite(audio.duration) ? audio.duration * 1000 : 0, rate: audio.playbackRate,
            buffering: audio.seeking || (!audio.paused && audio.readyState < 3), capturedAtMs: Date.now(),
            title: displaySong?.name ?? '', artist: resolvePlaybackSongArtist(displaySong) ?? '' } : {};
        const data = { action, lease, playbackAttempt:attempt(), revision: ++revision, songKey: displaySong && (bound||mixed) ? getPlaybackSongKey(displaySong) : '',
            playing: audio ? !audio.paused && !audio.ended : elements.some(element => !element.paused && !element.ended), ...clock, ...extra };
        const response = serial.catch(() => {}).then(() => native.compatiblePlayback(data));
        serial = response; return response;
    };
    const forwarded = new WeakSet<Event>();
    const ended = (event: Event) => {
        const element = event.target;
        if (!(element instanceof HTMLAudioElement) || isNativeAudioElement(element) || forwarded.has(event)) return;
        event.stopImmediatePropagation();
        const captured = attempt();
        void send('boundary').then(result => {
            if (!live || captured !== attempt() || !result.accepted || result.blocked) return;
            const next = new Event('ended'); forwarded.add(next); element.dispatchEvent(next);
        }).catch(() => setStatusMessage({ type: 'error', text: '无法确认定时曲尾状态，已停止自动续播，请手动重试' }));
    };
    let lastIdentity = '';
    const update = () => {
        const state = usePlaybackStore.getState();
        const identity = JSON.stringify([selectDisplaySong(state) && getPlaybackSongKey(selectDisplaySong(state)!), state.audioSrc, state.playerState]);
        if (identity === lastIdentity) return;
        lastIdentity = identity;
        void send('state').catch(() => {}); applyBarrier();
    };
    let lastClockEvent = 0;
    const media = (event: Event) => {
        if (!(event.target instanceof HTMLAudioElement) || isNativeAudioElement(event.target)) return;
        const now = performance.now();
        if (event.type === 'timeupdate' && now - lastClockEvent < 1000) return;
        lastClockEvent = now; void send('state').catch(() => {});
    };
    const visible = () => { if (document.visibilityState === 'visible') void send('resume').catch(() => {}); };
    document.addEventListener('ended', ended, true);
    const clockEvents = ['play', 'pause', 'timeupdate', 'seeking', 'seeked', 'ratechange', 'waiting', 'playing', 'durationchange'];
    clockEvents.forEach(event => document.addEventListener(event, media, true));
    document.addEventListener('visibilitychange', visible);
    const unsubscribe = usePlaybackStore.subscribe(update);
    const ready = send('claim').then(value => { if (!value.accepted) throw new Error('Compatible ownership rejected');setCompatibleOutputSession(lease,attempt); update(); });
    const binding = { lease, ready, release: async () => {
        await ready;
        if (!pauseCompatibleAudio(true,true)) throw new Error('Browser output did not pause');
        if(!await quietGraph('handoff'))throw new Error('Browser DSP output did not suspend');
        const response = await send('release', { paused: true });
        if (!response.accepted) throw new Error('Compatible release was not acknowledged');
        setCompatibleOutputSession('');live = false; barrier = false; applyBarrier(); unsubscribe();
        document.removeEventListener('ended', ended, true); clockEvents.forEach(event => document.removeEventListener(event, media, true));
        document.removeEventListener('visibilitychange', visible);
        if (window.__tingyuSleepOutput === endpoint) delete window.__tingyuSleepOutput;
        if (owner === binding) owner = null;
    } };
    owner = binding;
    return ready;
}
export async function releaseCompatibleSleepOutput(): Promise<void> { if (owner) await owner.release(); }

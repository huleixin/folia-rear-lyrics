import type { ObsBrowserSourceAudio, ObsBrowserSourceConfig } from '../types/obsBrowserSource';
import type { RearLyricsClock } from '../types/rearLyricsClock';
import type { RearUploadedFont } from './rearLyricsFont';

// src/services/rearStateRelay.ts
// One native state read feeds both same-origin rear documents; only the intended iframe may subscribe.
export type RearStateSnapshot = { revision: number; config?: ObsBrowserSourceConfig; uploadedFont?: RearUploadedFont | null; clock?: RearLyricsClock; audio?: ObsBrowserSourceAudio };
const SUBSCRIBE = 'tingyu-rear-state-subscribe', UNSUBSCRIBE = 'tingyu-rear-state-unsubscribe', STATE = 'tingyu-rear-state', READY = 'tingyu-rear-relay-ready';
export type RearSnapshotReceiver = (snapshot: (value: RearStateSnapshot) => void, connected: (value: boolean) => void) => () => void;

export function createRearStateRelay(frame: () => Window | null | undefined, host: Window = window) {
    let session = '', latest: RearStateSnapshot | null = null, connected = false, disposed = false;
    const send = (snapshot?: RearStateSnapshot) => {
        if (disposed || !session) return;
        try { frame()?.postMessage({ type: STATE, session, connected, ...(snapshot ? { snapshot } : {}) }, host.location.origin); }
        catch { /* A frame being replaced will subscribe again from its new document. */ }
    };
    const message = (event: MessageEvent) => {
        if (event.origin !== host.location.origin || !event.source || event.source !== frame()) return;
        const data = event.data;
        if (typeof data?.session !== 'string' || data.session.length > 100) return;
        if (data.type === SUBSCRIBE) { session = data.session; send(latest ?? undefined); }
        else if (data.type === UNSUBSCRIBE && data.session === session) session = '';
    };
    host.addEventListener('message', message);
    try { frame()?.postMessage({ type: READY }, host.location.origin); } catch { /* The child's initial handshake also retries. */ }
    return {
        publish(snapshot: RearStateSnapshot) {
            if (disposed) return;
            latest = { ...latest, ...snapshot }; connected = true; send(snapshot);
        },
        setConnected(value: boolean) { if (connected !== value) { connected = value; send(); } },
        dispose() { disposed = true; host.removeEventListener('message', message); latest = null; session = ''; },
    };
}

export function subscribeRearStateRelay(snapshot: (value: RearStateSnapshot) => void, connected: (value: boolean) => void, client: Window = window) {
    const session = `${Date.now()}-${Math.random()}`;
    let disposed = false, acknowledged = false, retry = 0;
    const request = () => {
        if (disposed) return;
        clearTimeout(retry);
        client.parent.postMessage({ type: SUBSCRIBE, session }, client.location.origin);
        if (!acknowledged) retry = client.setTimeout(request, 1000);
    };
    const message = (event: MessageEvent) => {
        if (event.origin !== client.location.origin || event.source !== client.parent || disposed) return;
        if (event.data?.type === READY) { request(); return; }
        if (event.data?.type !== STATE || event.data.session !== session) return;
        acknowledged = true; clearTimeout(retry);
        connected(event.data.connected === true);
        if (event.data.snapshot) snapshot(event.data.snapshot);
    };
    const dispose = () => {
        if (disposed) return;
        disposed = true; clearTimeout(retry); client.removeEventListener('message', message); client.removeEventListener('pagehide', dispose);
        client.parent.postMessage({ type: UNSUBSCRIBE, session }, client.location.origin);
    };
    client.addEventListener('message', message); client.addEventListener('pagehide', dispose); request();
    return dispose;
}

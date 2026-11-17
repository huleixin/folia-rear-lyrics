import { useEffect } from 'react';
import { currentTime } from '../stores/motionSignals';
import { usePlaybackStore, selectDisplaySong, selectDisplayPlayerState } from '../stores/usePlaybackStore';
import { PlayerState } from '../types';
import type { SongResult } from '../types';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../utils/appPlaybackGuards';
import { PlaybackListenTracker } from '../utils/playbackListenTracker';
import { hydratePreferences, recordDiscoveryFeedback } from '../services/discovery/preferences';
import { useDiscoverySettingsStore } from '../stores/useDiscoverySettingsStore';
import { useOnlineProviderAccountStore } from '../stores/useOnlineProviderAccountStore';
import { LISTENING_STATISTICS_CLEARED, LISTENING_STATISTICS_SYNC, storeListeningSession } from '../services/listeningStatistics';
import { getTingyuPlayback } from '../platform/tingyuPlayback';

// src/hooks/useDiscoveryListening.ts
type NativeSessionPayload = {
    id?: string;
    songKey?: string;
    providerId?: string;
    mediaId?: string;
    title?: string;
    artist?: string;
    album?: string;
    artwork?: string;
    durationMs?: number;
    startedAt?: number;
    endedAt?: number;
    seconds?: number;
    completed?: boolean;
};

function resolveSongForNativeSession(payload: NativeSessionPayload): SongResult | null {
    const key = payload.songKey || '';
    if (!key) return null;
    const state = usePlaybackStore.getState();
    const candidates = [state.currentSong, ...state.playQueue];
    const matched = candidates.find(item => item && getPlaybackSongKey(item) === key);
    if (matched) return matched;
    const providerId = payload.providerId || 'online';
    const mediaId = payload.mediaId || key;
    return {
        id: mediaId,
        name: payload.title || '未知歌曲',
        artists: (payload.artist || '').split(/[、/,]/).map(s => s.trim()).filter(Boolean).map((name, idx) => ({ id: `${providerId}:a:${idx}`, name })),
        album: { id: `${providerId}:al:${mediaId}`, name: payload.album || '', coverUrl: payload.artwork || undefined },
        durationMs: Number(payload.durationMs) || 0,
        source: providerId === 'local' ? 'local' : providerId === 'navidrome' ? 'navidrome' : 'online',
        ...(providerId !== 'local' && providerId !== 'navidrome' ? { onlineRef: { providerId, mediaId } } : {}),
    } as SongResult;
}

/** Observe the existing clock outside React + ingest native Media3 sessions. */
export function useDiscoveryListening() {
    useEffect(() => {
        void hydratePreferences();
        const tracker = new PlaybackListenTracker();
        let song: SongResult | null = null, session = '', playing = false, lastSample = 0, lastCheckpointMs = 0;
        let startedAt = 0, providerId = '', accountKey = '';
        const recordedNativeIds = new Set<string>();
        const ingestNativeSession = (raw: NativeSessionPayload | null | undefined) => {
            if (!raw || !raw.id || !raw.songKey || !Number.isFinite(raw.seconds) || (raw.seconds ?? 0) < 30) return;
            if (!useDiscoverySettingsStore.getState().record) return;
            const resolved = resolveSongForNativeSession(raw);
            if (!resolved) return;
            const source = getPlaybackSourceRef(resolved);
            const prov = source.kind === 'online' ? source.providerId : source.kind;
            const acct = source.kind === 'online'
                ? String(useOnlineProviderAccountStore.getState().accounts[source.providerId]?.user?.id ?? 'anonymous') : 'device';
            if (!recordedNativeIds.has(raw.id)) {
                recordedNativeIds.add(raw.id);
                recordDiscoveryFeedback(resolved, 'listen', { session: raw.id, seconds: raw.seconds!, completed: Boolean(raw.completed) });
            }
            void storeListeningSession({
                id: raw.id, songKey: raw.songKey, providerId: prov, accountKey: acct,
                startedAt: Number(raw.startedAt) || Date.now(), endedAt: Number(raw.endedAt) || Date.now(),
                seconds: raw.seconds!, completed: Boolean(raw.completed), song: resolved,
            });
        };
        const drainNative = async () => {
            try {
                const native = getTingyuPlayback<{ drainListeningSessions?: () => Promise<{ sessions?: NativeSessionPayload[] }> }>();
                const res = await native?.drainListeningSessions?.();
                res?.sessions?.forEach(ingestNativeSession);
            } catch { /* Native plugin absent on web/desktop. */ }
        };
        const begin = (next: SongResult) => {
            startedAt = Date.now(); lastCheckpointMs = 0;
            session = globalThis.crypto?.randomUUID?.() ?? `${startedAt}:${Math.random()}`;
            const source = getPlaybackSourceRef(next);
            providerId = source.kind === 'online' ? source.providerId : source.kind;
            accountKey = source.kind === 'online'
                ? String(useOnlineProviderAccountStore.getState().accounts[source.providerId]?.user?.id ?? 'anonymous') : 'device';
            tracker.start({ songKey: getPlaybackSongKey(next), mediaId: String(next.id), totalSeconds: next.durationMs / 1000 });
        };
        const checkpointActive = () => {
            if (!song || !useDiscoverySettingsStore.getState().record) return;
            const listened = tracker.getListenedSeconds();
            if (listened < 30) return;
            const totalSeconds = song.durationMs / 1000;
            const completed = totalSeconds > 0 && listened >= totalSeconds * .95;
            void storeListeningSession({ id: session, songKey: getPlaybackSongKey(song), providerId, accountKey,
                startedAt, endedAt: Date.now(), seconds: listened, completed, song });
        };
        const settle = () => {
            const report = tracker.settle();
            if (song && report && useDiscoverySettingsStore.getState().record) {
                const completed = report.totalSeconds > 0 && report.playedSeconds >= report.totalSeconds * .95;
                recordDiscoveryFeedback(song, 'listen', { session, seconds: report.playedSeconds, completed });
                void storeListeningSession({ id: session, songKey: report.songKey, providerId, accountKey,
                    startedAt, endedAt: Date.now(), seconds: report.playedSeconds, completed, song });
            }
            tracker.clear();
        };
        const update = () => {
            const state = usePlaybackStore.getState(), next = selectDisplaySong(state);
            playing = selectDisplayPlayerState(state) === PlayerState.PLAYING;
            if (!useDiscoverySettingsStore.getState().record) { tracker.clear(); song = null; return; }
            if ((next ? getPlaybackSongKey(next) : null) === (song ? getPlaybackSongKey(song) : null)) return;
            settle(); song = next;
            if (next) begin(next);
            void drainNative();
        };
        const unsubscribe = usePlaybackStore.subscribe(update);
        const settings = useDiscoverySettingsStore.subscribe(update); update();
        const resetStatistics = () => { recordedNativeIds.clear(); tracker.clear(); if (song) begin(song); };
        const syncNow = () => { checkpointActive(); void drainNative(); };
        const onVisibility = () => { if (document.visibilityState === 'visible') void drainNative(); };
        window.addEventListener(LISTENING_STATISTICS_CLEARED, resetStatistics);
        window.addEventListener(LISTENING_STATISTICS_SYNC, syncNow);
        document.addEventListener('visibilitychange', onVisibility);
        let nativeListener: { remove: () => Promise<void> } | null = null;
        try {
            const native = getTingyuPlayback<{ addListener?: (event: string, cb: (data: { type?: string; session?: NativeSessionPayload }) => void) => Promise<{ remove: () => Promise<void> }> }>();
            void native?.addListener?.('playbackEvent', event => {
                if (event?.type === 'listening-session') ingestNativeSession(event.session);
            }).then(handle => { nativeListener = handle; }).catch(() => {});
        } catch { /* Ignore when web/mocked. */ }
        void drainNative();
        const clock = currentTime.on('change', value => {
            if (!playing || !song) return;
            const now = performance.now(); if (now - lastSample < 200) return; lastSample = now;
            if (tracker.handleProgress(value).restarted) {
                settle(); begin(song);
            } else if (now - lastCheckpointMs >= 15_000 && tracker.getListenedSeconds() >= 30) {
                lastCheckpointMs = now;
                checkpointActive();
            }
        });
        return () => {
            unsubscribe(); settings(); clock();
            window.removeEventListener(LISTENING_STATISTICS_CLEARED, resetStatistics);
            window.removeEventListener(LISTENING_STATISTICS_SYNC, syncNow);
            document.removeEventListener('visibilitychange', onVisibility);
            void nativeListener?.remove?.();
            settle();
        };
    }, []);
}

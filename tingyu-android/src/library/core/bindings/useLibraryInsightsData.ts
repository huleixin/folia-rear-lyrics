import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { LibraryHomeSurfaceProps } from '../contracts/suite';
import type { SmartCandidate } from '../model/smartPlaylists';
import type { ListeningSessionRecord } from '../../../types/listeningStatistics';
import { LISTENING_STATISTICS_CHANGED, readListeningSessions } from '../../../services/listeningStatistics';
import { getLocalPlayHistory } from '../../../services/localPlayHistory';
import { buildLocalQueue, LIST_ROW_COVER_SIZE } from '../../../services/playbackAdapters';
import { useOnlineProviderAccountStore } from '../../../stores/useOnlineProviderAccountStore';
import { libraryScope } from '../services/unifiedLibrarySource';
import { DiscoveryRequestCache } from '../../../services/discovery/requestCache';
import { omni } from '../../../services/onlineMusic/omni';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';

// src/library/core/bindings/useLibraryInsightsData.ts
const likes = new DiscoveryRequestCache(2, 16);
type Snapshot = { owner: string; sessions: ListeningSessionRecord[]; candidates: SmartCandidate[]; truncated: boolean; error: string };
const empty = { owner: '', sessions: [], candidates: [], truncated: false, error: '' };
/** Only the active library loads insights; source/account changes hide stale snapshots. */
export function useLibraryInsightsData(props: LibraryHomeSurfaceProps, active: boolean, source: string) {
    const accounts = useOnlineProviderAccountStore(state => state.accounts);
    const registry = useSyncExternalStore(omni.subscribeProviders, omni.getProviderRegistryVersion);
    const [revision, setRevision] = useState(0), [snapshot, setSnapshot] = useState<Snapshot>(empty);
    const ids = useMemo(() => source === 'local' ? [] : omni.getProviderSummaries().filter(provider =>
        provider.availability.configured && (source === 'all' || provider.providerId === source)).map(provider => provider.providerId), [source, accounts, registry]);
    const owner = JSON.stringify([source, ids.map(id => [id, libraryScope(id), accounts[id]?.likedSongIds])]);
    useEffect(() => {
        if (!active) return;
        const update = () => setRevision(value => value + 1);
        window.addEventListener(LISTENING_STATISTICS_CHANGED, update);
        return () => window.removeEventListener(LISTENING_STATISTICS_CHANGED, update);
    }, [active]);
    useEffect(() => {
        if (!active) return;
        const task = new AbortController();
        const timer = setTimeout(() => {
            task.abort();
            setSnapshot(previous => ({ ...(previous.owner === owner ? previous : empty), owner,
                error: 'libraryV2.insightsTimeout' }));
        }, 15_000);
        setSnapshot(empty);
        void (async () => {
            const accountIds = new Map(ids.flatMap(id => {
                const account = libraryScope(id);
                return account.authenticated && account.userId != null ? [[id, String(account.userId)] as const] : [];
            }));
            const [records, legacy] = await Promise.all([readListeningSessions(0, Date.now() + 1, 50_001,
                record => record.providerId === 'local' ? source === 'all' || source === 'local'
                    : accountIds.get(record.providerId) === record.accountKey), getLocalPlayHistory()]);
            const sessions = records.slice(0, 50_000);
            const candidates = new Map<string, SmartCandidate>();
            sessions.forEach(record => candidates.set(record.songKey, { song: record.song }));
            if (source === 'all' || source === 'local') {
                const history = new Map(legacy.map(record => [record.songId, record.lastPlayedAt]));
                const favorite = new Set(props.localPlaylists.find(playlist => playlist.isFavorite)?.songIds || []);
                const queue = buildLocalQueue(props.localSongs, undefined, props.localLibraryCatalog, LIST_ROW_COVER_SIZE);
                const localById = new Map(props.localSongs.map(song => [song.id, song]));
                queue.forEach(song => {
                    const localId = song.localRef?.songId;
                    const local = localId ? localById.get(localId) : undefined;
                    if (!local) return;
                    candidates.set(getPlaybackSongKey(song), {
                        song,
                        liked: favorite.has(local.id),
                        addedAt: local.addedAt,
                        folder: local.folderName,
                        legacyLastPlayed: history.get(local.id),
                    });
                });
            }
            const publish = (error = '') => { if (!task.signal.aborted) setSnapshot({ owner, sessions, candidates: [...candidates.values()], truncated: records.length > 50_000, error }); };
            publish(); // Local history can be used while remote favorites are still loading.
            const results = await Promise.allSettled(ids.map(async id => {
                const scope = libraryScope(id);
                if (!scope.ready || !scope.authenticated || scope.userId == null || !omni.getLibraryCapabilities(id).likedSongs) return;
                const identity = JSON.stringify(scope);
                const songs = await likes.read(JSON.stringify([id, identity, accounts[id]?.likedSongIds]), 60_000, async () => {
                    if (task.signal.aborted || JSON.stringify(libraryScope(id)) !== identity) throw new Error('stale');
                    return omni.getProviderLikedSongs(id, scope.userId!);
                }, task.signal);
                if (task.signal.aborted || JSON.stringify(libraryScope(id)) !== identity) return;
                songs.forEach(song => { const key = getPlaybackSongKey(song); candidates.set(key, { ...candidates.get(key), song, liked: true }); });
                publish();
            }));
            publish(results.some(result => result.status === 'rejected') ? 'libraryV2.insightsPartial' : '');
        })().catch(() => { if (!task.signal.aborted) setSnapshot({ ...empty, owner, error: 'libraryV2.insightsFailed' }); }).finally(() => clearTimeout(timer));
        return () => { clearTimeout(timer); task.abort(); };
    }, [active, owner, revision, props.localSongs, props.localPlaylists, props.localLibraryCatalog]);
    return { ...(snapshot.owner === owner ? snapshot : empty), queryOwner: owner, loading: active && snapshot.owner !== owner, retry: () => setRevision(value => value + 1) };
}

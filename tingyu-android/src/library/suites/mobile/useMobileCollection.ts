import { precacheCollectionResources } from '../../../services/collectionResourcePrecache';
import { useMemo, useCallback } from 'react';
import { useLibraryTrackPlayback } from '../../../hooks/useLibraryTrackPlayback';
import type { LibraryCollectionSurfaceProps } from '../../core/contracts/suite';
import { collectionKey } from '../../core/model/collectionIdentity';
import { useCollectionResourceState } from '../../core/bindings/useCollectionResourceState';
import { useLibrarySessionQuery } from '../../core/bindings/useLibrarySessionQuery';
import { useCommittedQuery } from '../../core/bindings/useCommittedQuery';
import { useCollectionView } from '../../core/bindings/useCollectionView';
import { useCollectionActions } from '../../core/bindings/useCollectionActions';
import { useCollectionMutationSnapshot } from '../../core/bindings/useCollectionMutations';
import { useLocalTrackSortStore } from '../../core/state/useLocalTrackSortStore';
import { useLocalPlaylistSortStore } from '../../core/state/useLocalPlaylistSortStore';
import { playlistSongIdOf, sortPlaylistTracks } from '../../../utils/localPlaylistView';
import {
    buildCoreSurfaceParams,
    buildGridSurfaceState,
    runGridSurfaceAction,
} from '../../core/model/collectionSurface';
import { useGridSurfaceRegistration } from '../../../hooks/useGridSurfaceRegistration';

// src/library/suites/mobile/useMobileCollection.ts
const NO_TRACKS: NonNullable<ReturnType<typeof useCollectionResourceState>['snapshot']>['tracks'] = [];
export function useMobileCollection(props: LibraryCollectionSurfaceProps) {
    const { snapshot } = useCollectionResourceState(props.resource);
    const sessionKey = collectionKey(props.collection);
    const { query, setQuery } = useLibrarySessionQuery(sessionKey);
    const committedQuery = useCommittedQuery(query);
    const mutations = useCollectionMutationSnapshot(props.mutations);
    const field = useLocalTrackSortStore((state) => state.field);
    const direction = useLocalTrackSortStore((state) => state.direction);
    const sortActions = useLocalTrackSortStore.getState();
    const supportsSort = props.collection.source === 'local' && props.collection.type === 'folder';
    const songsById = useMemo(() => new Map(props.localSongs?.map((song) => [song.id, song])), [props.localSongs]);
    const localSort = useMemo(
        () => (supportsSort ? { songsById, field, direction } : null),
        [supportsSort, songsById, field, direction]
    );
    // 本地歌单的视图排序（阶段二）：只影响详情页展示顺序，存储顺序（songIds）不动，
    // 所以不能用 folder 那套全局 store —— 字段集不同，语义也不同（default=手动顺序）。
    const isLocalPlaylistCollection = props.collection.source === 'local'
        && props.collection.type === 'playlist'
        && Boolean((props.collection as { playlistId?: string }).playlistId)
        && !(props.collection as { isVirtual?: boolean }).isVirtual;
    const playlistSortField = useLocalPlaylistSortStore((state) => state.field);
    const playlistSortDirection = useLocalPlaylistSortStore((state) => state.direction);
    const playlistSortActions = useLocalPlaylistSortStore.getState();
    const addedAtById = useMemo(
        () => Object.fromEntries((props.localSongs ?? []).map(song => [song.id, song.addedAt || 0])),
        [props.localSongs]
    );
    const orderedTracks = useMemo(() => (
        isLocalPlaylistCollection
            ? sortPlaylistTracks(snapshot?.tracks ?? NO_TRACKS, playlistSortField, playlistSortDirection, addedAtById)
            : snapshot?.tracks ?? NO_TRACKS
    ), [addedAtById, isLocalPlaylistCollection, playlistSortDirection, playlistSortField, snapshot?.tracks]);
    const view = useCollectionView({ tracks: orderedTracks, committedQuery, localSort });
    const baseActions = useCollectionActions({
        resource: props.resource,
        snapshot,
        view,
        port: props.playback,
        collectionType: props.collection.type,
    });
    const startResourceCache = useCallback((track: import('../../../types').SongResult) => {
        void precacheCollectionResources(props.collection, snapshot?.tracks ?? [], track);
    }, [props.collection, snapshot?.tracks]);
    const actions = useMemo(() => ({ ...baseActions,
        playScope: () => {
            const first = view.contextTracks[0];
            if (first) startResourceCache(first);
            baseActions.playScope();
        },
    }), [baseActions, view.contextTracks, startResourceCache]);
    const selectTrack = useLibraryTrackPlayback(props.playback.playTrack, props.playback.togglePlayback);
    const playTrack = useCallback(
        (track: Parameters<typeof selectTrack>[0]) => {
            startResourceCache(track);
            selectTrack(track, view.contextTracks);
        },
        [selectTrack, view.contextTracks, startResourceCache]
    );
    const surface = buildCoreSurfaceParams({
        declaredActions: props.declaredActions,
        supportsLocalTrackSorting: supportsSort,
        canReloadOnlineCollection: actions.capabilities.reload.enabled,
        filteredTrackCount: view.contextTracks.length,
        isFilterActive: view.isFilterActive,
        sortField: field,
        sortDirection: direction,
        setSortField: sortActions.setField,
        setSortDirection: sortActions.setDirection,
        playFiltered: actions.playScope,
        enqueueFiltered: actions.enqueueScope,
        reloadOnlineCollection: actions.reload,
        mutationSnapshot: mutations,
        mutations: props.mutations,
    });
    useGridSurfaceRegistration({
        isInteractive: props.isInteractive,
        getState: () => buildGridSurfaceState(surface),
        run: (action) => runGridSurfaceAction(action, surface),
    });
    return {
        sessionKey,
        snapshot,
        query,
        setQuery,
        view,
        actions,
        playTrack,
        mutations,
        supportsSort,
        field,
        direction,
        sortActions,
        // 歌单详情用：排序选择器与「上移/下移」是否可用的判定（仅默认顺序下可手动调序）。
        playlistSort: {
            supported: isLocalPlaylistCollection,
            field: playlistSortField,
            direction: playlistSortDirection,
            actions: playlistSortActions,
        },
    };
}

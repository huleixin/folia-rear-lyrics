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
    const view = useCollectionView({ tracks: snapshot?.tracks ?? NO_TRACKS, committedQuery, localSort });
    const actions = useCollectionActions({
        resource: props.resource,
        snapshot,
        view,
        port: props.playback,
        collectionType: props.collection.type,
    });
    const selectTrack = useLibraryTrackPlayback(props.playback.playTrack, props.playback.togglePlayback);
    const playTrack = useCallback(
        (track: Parameters<typeof selectTrack>[0]) => selectTrack(track, view.contextTracks),
        [selectTrack, view.contextTracks]
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
    };
}

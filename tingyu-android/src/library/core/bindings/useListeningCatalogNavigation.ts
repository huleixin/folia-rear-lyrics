import { useEffect, useRef, useState } from 'react';
import type { ListeningEntitySummary } from '../../../services/listeningStatistics';
import { listeningEntityCollection } from '../services/listeningCollection';
import { libraryScope } from '../services/unifiedLibrarySource';
import type { LibraryHomeSurfaceProps } from '../contracts/suite';

// src/library/core/bindings/useListeningCatalogNavigation.ts
/** Resolves on demand, ignoring late navigation after account/page changes. */
export function useListeningCatalogNavigation(owner: string, active: boolean, opened: boolean,
    navigation: Pick<LibraryHomeSurfaceProps, 'localSongs' | 'localLibraryCatalog' | 'onOpenGridView'>) {
    const [catalogError, setCatalogError] = useState(false);
    const request = useRef(0), scope = useRef({ owner, active, opened });
    scope.current = { owner, active, opened };
    useEffect(() => { setCatalogError(false); return () => { request.current++; }; }, [owner, active, opened]);
    const openEntity = async (entry: ListeningEntitySummary, kind: 'artist' | 'album') => {
        const generation = ++request.current;
        const source = entry.song.sourceRef;
        const account = source?.kind === 'online' ? JSON.stringify(libraryScope(source.providerId)) : '';
        const current = () => generation === request.current && scope.current.owner === owner && scope.current.active && scope.current.opened
            && (source?.kind !== 'online' || JSON.stringify(libraryScope(source.providerId)) === account);
        setCatalogError(false);
        try {
            const collection = await listeningEntityCollection(entry, kind, navigation);
            if (!current()) return;
            if (collection) navigation.onOpenGridView(collection);
            else setCatalogError(true);
        } catch { if (current()) setCatalogError(true); }
    };
    return { catalogError, openEntity };
}

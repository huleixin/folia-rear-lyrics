import React, { useMemo, useState } from 'react';
import { summarizeListening } from '../../../../services/listeningStatistics';
import { useListeningCatalogNavigation } from '../../../core/bindings/useListeningCatalogNavigation';
import { useListeningRangeData } from '../../../core/bindings/useListeningRangeData';
import type { LibraryHomeSurfaceProps } from '../../../core/contracts/suite';
import { listeningRange, type ListeningRange } from '../../../core/model/listeningRange';
import { useModalBackHandler } from '../../../../hooks/useModalBackHandler';
import type { SongResult } from '../../../../types';
import ListeningFootprintPage from './ListeningFootprintPage';
import { useHomeSourceStore } from '../../../../stores/useHomeSourceStore';

// src/library/suites/mobile/native/useListeningFootprint.ts
/** Formal secondary Listening Footprint page bound to real effective listening sessions. */
export function useListeningFootprint(
    source: string,
    scopeOwner: string,
    active: boolean,
    play: (song: SongResult, queue?: SongResult[]) => void,
    clear: () => void,
    owner: string,
    navigation: Pick<LibraryHomeSurfaceProps, 'localSongs' | 'localLibraryCatalog' | 'onOpenGridView'>,
) {
    const [opened, setOpened] = useState(false);
    const [range, setRange] = useState<ListeningRange>('month');
    const data = useListeningRangeData(source, scopeOwner, opened && active, range, { from: '', to: '' });
    const { records, truncated } = data;
    const { openEntity } = useListeningCatalogNavigation(owner, active, opened, navigation);
    useModalBackHandler(opened && active, () => setOpened(false));

    const day = new Date().toLocaleDateString('sv-SE');
    const summary = useMemo(() => {
        const bounds = listeningRange(range, Date.now());
        return summarizeListening(
            opened && active && bounds
                ? records.filter(record => record.startedAt >= bounds.from && record.startedAt < bounds.to)
                : [],
        );
    }, [records, range, day, opened, active]);

    const page = React.createElement(ListeningFootprintPage, {
        open: opened && active,
        onClose: () => setOpened(false),
        range,
        onRangeChange: setRange,
        summary,
        loading: data.loading,
        error: Boolean(data.error),
        truncated,
        onRetry: data.retry,
        onPlaySong: play,
        onOpenEntity: (entry, kind) => { void openEntity(entry, kind); },
        onClearStats: clear,
        onGoDiscover: () => {
            setOpened(false);
            useHomeSourceStore.getState().setSource('online');
            window.dispatchEvent(new CustomEvent('tingyu-navigate-tab', { detail: { tab: 'home' } }));
        },
    });

    return { opened, open: () => setOpened(true), close: () => setOpened(false), page };
}

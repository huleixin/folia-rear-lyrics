import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ListImperativeAPI } from 'react-window';
import type { CollectionView } from '../../core/bindings/useCollectionView';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';

// src/library/suites/mobile/useMobileTrackLocator.ts
// Track identity includes provider. Only range-boundary changes enter React, never scroll pixels.
export function useMobileTrackLocator({
    view,
    activeKey,
    list,
    hasHeader,
    onClearQuery,
}: {
    view: CollectionView;
    activeKey: string;
    list: { current: ListImperativeAPI | null };
    hasHeader: boolean;
    onClearQuery?: () => void;
}) {
    const index = useMemo(
        () => (activeKey ? view.displayTracks.findIndex((track) => getPlaybackSongKey(track) === activeKey) : -1),
        [view.displayTracks, activeKey]
    );
    const filteredIndex = index < 0 ? -1 : view.matchIndexes ? view.matchIndexes.indexOf(index) : index;
    const row = filteredIndex < 0 ? -1 : filteredIndex + (hasHeader ? 1 : 0);
    const range = useRef({ startIndex: -1, stopIndex: -1 });
    const [visible, setVisible] = useState(false);
    const [located, setLocated] = useState(false);
    const pending = useRef('');
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const raf = useRef(0);
    const onRowsRendered = useCallback(
        (next: { startIndex: number; stopIndex: number }) => {
            range.current = next;
            const value = row >= next.startIndex && row <= next.stopIndex && row >= 0;
            setVisible((previous) => (previous === value ? previous : value));
        },
        [row]
    );
    useEffect(() => {
        onRowsRendered(range.current);
    }, [onRowsRendered]);
    const scrollToCurrent = useCallback(() => {
        if (row < 0) return;
        list.current?.scrollToRow({
            index: row,
            align: 'center',
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
        setLocated(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setLocated(false), 1500);
    }, [row, list]);
    const locate = useCallback(() => {
        if (index < 0) return;
        if (filteredIndex < 0 && onClearQuery) {
            pending.current = activeKey;
            onClearQuery();
        } else scrollToCurrent();
    }, [index, filteredIndex, onClearQuery, activeKey, scrollToCurrent]);
    useEffect(() => {
        if (!pending.current || pending.current !== activeKey || row < 0) return;
        pending.current = '';
        raf.current = requestAnimationFrame(scrollToCurrent);
        return () => cancelAnimationFrame(raf.current);
    }, [row, activeKey, scrollToCurrent]);
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
            cancelAnimationFrame(raf.current);
        },
        []
    );
    return { locate, located, onRowsRendered, show: index >= 0 && !visible && (row >= 0 || !!onClearQuery) };
}

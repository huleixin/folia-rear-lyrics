import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { List, useListRef, type RowComponentProps } from 'react-window';
import { MoreVertical, LocateFixed } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PlayerState, type SongResult } from '../../../types';
import { usePlaybackStore, selectDisplaySong, selectDisplayPlayerState } from '../../../stores/usePlaybackStore';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';
import { getSongArtistLabel, getSongDurationMs, getProviderSongMetadata } from '../../../services/onlineMusic/songMetadata';
import { getSizedCoverUrl } from '../../../utils/coverUrl';
import { isSongUnavailable } from '../../../services/onlineMusic/songAvailability';
import { formatTime } from '../../../utils/appPlaybackHelpers';
import type { CollectionView } from '../../core/bindings/useCollectionView';
import MobileScrollFrame from './MobileScrollFrame';
import MobilePlayingIndicator from './MobilePlayingIndicator';
import { useMobileTrackLocator } from './useMobileTrackLocator';
import MobileArtwork from './MobileArtwork';

// src/library/suites/mobile/MobileTrackList.tsx
const scrollPositions = new Map<string, number>();
const headerSizes = new Map<string, number>();
type TrackRows = {
    tracks: SongResult[];
    indexes: number[] | null;
    activeKey: string;
    playing: boolean;
    header?: React.ReactNode;
    footer?: React.ReactNode;
    showArtwork: boolean;
    onHeaderHeight: (height: number) => void;
    onFooterHeight: (height: number) => void;
    onPlay: (track: SongResult) => void;
    onMenu: (track: SongResult, index: number) => void;
};
function MeasuredHeader({ children, onHeight }: React.PropsWithChildren<{ onHeight: (height: number) => void }>) {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const node = ref.current;
        if (!node) return;
        const measure = () => onHeight(Math.ceil(node.getBoundingClientRect().height));
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        measure();
        return () => observer.disconnect();
    }, [onHeight]);
    return <div ref={ref}>{children}</div>;
}
function TrackRow({
    index,
    style,
    tracks,
    indexes,
    activeKey,
    playing,
    header,
    footer,
    showArtwork,
    onHeaderHeight,
    onFooterHeight,
    onPlay,
    onMenu,
}: RowComponentProps<TrackRows>) {
    const { t } = useTranslation();
    if (header && index === 0)
        return (
            <div style={style}>
                <MeasuredHeader onHeight={onHeaderHeight}>{header}</MeasuredHeader>
            </div>
        );
    const trackIndex = index - (header ? 1 : 0);
    if (footer && trackIndex === (indexes?.length ?? tracks.length)) return <div style={style}>
        <MeasuredHeader onHeight={onFooterHeight}>{footer}</MeasuredHeader>
    </div>;
    const displayIndex = indexes?.[trackIndex] ?? trackIndex;
    const song = tracks[displayIndex];
    const active = getPlaybackSongKey(song) === activeKey;
    return (
        <div style={style} className={`ml-song-row${active ? ' is-current' : ''}`} data-testid="mobile-song-row" data-first={trackIndex === 0 ? 'true' : undefined}>
            <span className="ml-song-number">{String(displayIndex + 1).padStart(2, '0')}</span>
            {showArtwork && <button className="ml-song-art" onClick={() => onPlay(song)} disabled={isSongUnavailable(song)} aria-label={t('search.playTrack')}>
                <MobileArtwork src={getSizedCoverUrl(getProviderSongMetadata(song).coverUrl, 96)} />
            </button>}
            <button className="ml-song-copy" onClick={() => onPlay(song)} disabled={isSongUnavailable(song)}>
                <strong>{song.name}</strong>
                <small>{getSongArtistLabel(song)}</small>
            </button>
            {active && <MobilePlayingIndicator playing={playing} />}
            <span className="ml-duration">{formatTime(getSongDurationMs(song) / 1000)}</span>
            <button
                className="ml-icon"
                aria-label={t('mobileLibrary.trackActions', { name: song.name })}
                onClick={() => onMenu(song, displayIndex)}
            >
                <MoreVertical size={19} />
            </button>
        </div>
    );
}
export default function MobileTrackList({
    view,
    onPlay,
    onMenu,
    sessionKey,
    query,
    header,
    revealHeader,
    onClearQuery,
    footer,
    showArtwork = false,
}: {
    view: CollectionView;
    onPlay: TrackRows['onPlay'];
    onMenu: TrackRows['onMenu'];
    sessionKey: string;
    query: string;
    header?: React.ReactNode;
    footer?: React.ReactNode;
    showArtwork?: boolean;
    revealHeader?: boolean;
    onClearQuery?: () => void;
}) {
    const { t } = useTranslation();
    const active = usePlaybackStore(selectDisplaySong);
    const playing = usePlaybackStore(selectDisplayPlayerState) === PlayerState.PLAYING;
    const scrollKey = `${sessionKey}:${query}`;
    const [headerHeight, setHeaderHeight] = useState(() => headerSizes.get(scrollKey) ?? 320);
    const [footerHeight, setFooterHeight] = useState(96);
    const onHeaderHeight = useCallback(
        (height: number) => {
            headerSizes.set(scrollKey, height);
            if (headerSizes.size > 60) headerSizes.delete(headerSizes.keys().next().value!);
            setHeaderHeight((previous) => (previous === height ? previous : height));
        },
        [scrollKey]
    );
    const list = useListRef(null);
    const count = view.matchIndexes?.length ?? view.displayTracks.length;
    const restoredKey = useRef('');
    useEffect(() => {
        if (!count || restoredKey.current === scrollKey) return;
        // react-window publishes its element after its own state commit, not at the parent mount.
        const raf = requestAnimationFrame(() => {
            const element = list.current?.element;
            if (!element) return;
            element.scrollTop = scrollPositions.get(scrollKey) ?? 0;
            restoredKey.current = scrollKey;
        });
        return () => cancelAnimationFrame(raf);
    }, [scrollKey, list, count]);
    useEffect(() => {
        if (revealHeader) list.current?.scrollToRow({ index: 0, align: 'start', behavior: 'instant' });
    }, [revealHeader, list]);
    const locator = useMobileTrackLocator({
        view,
        activeKey: active ? getPlaybackSongKey(active) : '',
        list,
        hasHeader: !!header,
        onClearQuery,
    });
    const rowHeight = useCallback(
        (index: number) => header && index === 0 ? headerHeight
            : footer && index === count + (header ? 1 : 0) ? footerHeight : showArtwork ? 52 : 64,
        [header, headerHeight, footer, footerHeight, count, showArtwork]
    );
    const rowProps = useMemo(
        () => ({
            tracks: view.displayTracks,
            indexes: view.matchIndexes,
            activeKey: active ? getPlaybackSongKey(active) : '',
            playing,
            header,
            footer,
            showArtwork,
            onHeaderHeight,
            onFooterHeight: setFooterHeight,
            onPlay,
            onMenu,
        }),
        [view.displayTracks, view.matchIndexes, active, playing, header, footer, showArtwork, onHeaderHeight, onPlay, onMenu]
    );
    return (
        <MobileScrollFrame fill className={`ml-track-frame${locator.located ? ' ml-track-located' : ''}`}>
            <List
                listRef={list}
                className="ml-track-list"
                rowComponent={TrackRow}
                rowProps={rowProps}
                rowCount={count + (header ? 1 : 0) + (footer ? 1 : 0)}
                rowHeight={rowHeight}
                overscanCount={5}
                onRowsRendered={locator.onRowsRendered}
                style={{ width: '100%', height: '100%' }}
                onScroll={(event) => {
                    if (restoredKey.current !== scrollKey) return;
                    scrollPositions.set(scrollKey, event.currentTarget.scrollTop);
                    if (scrollPositions.size > 60) scrollPositions.delete(scrollPositions.keys().next().value!);
                }}
            />
            {locator.show && (
                <button
                    className="ml-locate-current"
                    aria-label={t('mobileLibrary.locateCurrent')}
                    onClick={locator.locate}
                >
                    <LocateFixed size={18} />
                    <span>{t('mobileLibrary.locateCurrent')}</span>
                </button>
            )}
        </MobileScrollFrame>
    );
}

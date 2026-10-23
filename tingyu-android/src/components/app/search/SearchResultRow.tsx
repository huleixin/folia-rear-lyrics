import React, { useState } from 'react';
import { Disc, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UnifiedSong } from '../../../types';
import type { MediaId } from '../../../types/onlineMusic';
import { formatSongName } from '../../../utils/songNameFormatter';
import { getSizedCoverUrl } from '../../../utils/coverUrl';
import { getSongUnavailableLabel, isSongUnavailable } from '../../../services/onlineMusic/songAvailability';
import { canResolveSongCatalogRef } from '../../../services/onlineMusic/catalogRefs';
import { getProviderSongMetadata } from '../../../services/onlineMusic/songMetadata';
import { selectDisplaySong, usePlaybackStore } from '../../../stores/usePlaybackStore';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';
import MobileSheet from '../../../library/suites/mobile/MobileSheet';

// src/components/app/search/SearchResultRow.tsx
type SearchResultRowProps = {
    track: UnifiedSong;
    style: React.CSSProperties;
    isDaylight: boolean;
    onPlayTrack: (track: UnifiedSong) => void;
    onAddTrackToQueue: (track: UnifiedSong) => void;
    onOpenArtist: (track: UnifiedSong, artistName: string, artistId?: MediaId, entityId?: string) => void;
    onOpenAlbum: (track: UnifiedSong, albumName: string, albumId?: MediaId, entityId?: string) => void;
};

const SearchResultRow: React.FC<SearchResultRowProps> = ({
    track, style, onPlayTrack, onAddTrackToQueue, onOpenArtist, onOpenAlbum,
}) => {
    const { t } = useTranslation();
    const [menu, setMenu] = useState(false);
    const isUnavailable = isSongUnavailable(track);
    const metadata = getProviderSongMetadata(track);
    const coverUrl = getSizedCoverUrl(metadata.coverUrl, 96);
    const active = usePlaybackStore(state => {
        const song = selectDisplaySong(state);
        return Boolean(song && getPlaybackSongKey(song) === getPlaybackSongKey(track));
    });
    const album = metadata.album;
    const canOpenAlbum = Boolean(album?.name && (
        track.isLocal ? album.entityId : track.isNavidrome ? track.navidromeData?.albumId
            : canResolveSongCatalogRef(track, 'album', album)
    ));
    const act = (callback: () => void) => { setMenu(false); callback(); };
    return <div style={style} className="ty-track-slot">
        <div className="ty-track" data-current={active || undefined} data-unavailable={isUnavailable || undefined}>
            <button type="button" disabled={isUnavailable} className="ty-track-art" onClick={() => onPlayTrack(track)} aria-label={t('search.playTrack')}>
                {coverUrl ? <img src={coverUrl} alt="" loading="lazy" decoding="async" /> : <Disc size={22} />}
            </button>
            <button type="button" disabled={isUnavailable} className="ty-track-copy" onClick={() => onPlayTrack(track)}>
                <strong>{formatSongName(track)}</strong>
                <small>{isUnavailable ? getSongUnavailableLabel(track, t('status.songUnavailableTag')) : metadata.artists.map(artist => artist.name).join(', ')}</small>
            </button>
            <button type="button" className="ty-track-more" onClick={() => setMenu(true)} aria-label={t('mobileStage.more')}><MoreHorizontal size={21} /></button>
        </div>
        {menu && <MobileSheet title={track.name} onClose={() => setMenu(false)}>
            <button className="ml-sheet-action" disabled={isUnavailable} onClick={() => act(() => onPlayTrack(track))}>{t('search.playTrack')}</button>
            <button className="ml-sheet-action" disabled={isUnavailable} onClick={() => act(() => onAddTrackToQueue(track))}>{t('navidrome.addToQueue')}</button>
            {metadata.artists.filter(artist => Boolean(track.isLocal ? artist.entityId : track.isNavidrome ? track.navidromeData?.artistId : canResolveSongCatalogRef(track, 'artist', artist))).map((artist, index) =>
                <button className="ml-sheet-action" key={`${artist.id}:${index}`} onClick={() => act(() => onOpenArtist(track, artist.name, artist.id, artist.entityId))}>{t('search.tabArtist')} · {artist.name}</button>)}
            {canOpenAlbum && album && <button className="ml-sheet-action" onClick={() => act(() => onOpenAlbum(track, album.name, album.id, album.entityId))}>{t('search.tabAlbum')} · {album.name}</button>}
        </MobileSheet>}
    </div>;
};
export default React.memo(SearchResultRow);

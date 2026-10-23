import React from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UnifiedSong } from '../../../types';
import type { MediaId } from '../../../types/onlineMusic';
import type { SearchAlbumHit, SearchArtistHit, SearchPlaylistHit } from '../../../types/search';
import { SEARCH_OVERVIEW_LIMIT } from '../../../types/search';
import type { ExploreCategory, ExploreKind } from '../../../stores/useSearchExploreStore';
import SearchResultRow from './SearchResultRow';
import { SearchAlbumRow, SearchArtistRow, SearchPlaylistRow } from './SearchCollections';

// src/components/app/search/SearchOverview.tsx
// 综合页：最佳匹配 + 四个分区。每个分区独立显示自己的加载 / 失败，
// 一个分区失败时其它分区照常展示，不会让整页空白。

type Props = {
    songs: UnifiedSong[];
    isSearching: boolean;
    songError: string | null;
    artists: ExploreCategory<SearchArtistHit>;
    albums: ExploreCategory<SearchAlbumHit>;
    playlists: ExploreCategory<SearchPlaylistHit>;
    isDaylight: boolean;
    onOpenArtist: (track: UnifiedSong, artistName: string, artistId?: MediaId, entityId?: string) => void;
    onOpenAlbum: (track: UnifiedSong, albumName: string, albumId?: MediaId, entityId?: string) => void;
    onPlayTrack: (track: UnifiedSong) => void;
    onAddTrackToQueue: (track: UnifiedSong) => void;
    onOpenArtistHit: (hit: SearchArtistHit) => void;
    onOpenAlbumHit: (hit: SearchAlbumHit) => void;
    onOpenPlaylistHit: (hit: SearchPlaylistHit) => void;
    onSeeAll: (kind: ExploreKind | 'song') => void;
};

const SectionHeader: React.FC<{ title: string; onMore?: () => void; busy?: boolean }> = ({ title, onMore, busy }) => {
    const { t } = useTranslation();
    return <div className="ty-section-head">
        <h3 className="ty-section-title">{title}{busy ? <Loader2 className="animate-spin" size={14} style={{ marginLeft: 8, display: 'inline', opacity: .6 }} /> : null}</h3>
        {onMore && <button type="button" className="ty-section-more" onClick={onMore}>
            {t('search.seeAll', { defaultValue: '查看全部' })}<ChevronRight size={14} />
        </button>}
    </div>;
};

const SectionFailure: React.FC<{ error: string | null }> = ({ error }) => {
    const { t } = useTranslation();
    if (!error) return null;
    return <p className="ty-section-error" role="status">{t('search.sectionFailed', { defaultValue: '这一部分暂时没有返回结果。' })}</p>;
};

export default function SearchOverview({
    songs, isSearching, songError, artists, albums, playlists, isDaylight,
    onOpenArtist, onOpenAlbum, onPlayTrack, onAddTrackToQueue,
    onOpenArtistHit, onOpenAlbumHit, onOpenPlaylistHit, onSeeAll,
}: Props) {
    const { t } = useTranslation();
    const topSongs = songs.slice(0, 5);
    const topArtists = artists.items.slice(0, SEARCH_OVERVIEW_LIMIT);
    const topAlbums = albums.items.slice(0, SEARCH_OVERVIEW_LIMIT);
    const topPlaylists = playlists.items.slice(0, SEARCH_OVERVIEW_LIMIT);
    const hasAnything = topSongs.length || topArtists.length || topAlbums.length || topPlaylists.length;
    const busy = isSearching || [artists, albums, playlists].some(category => category.status === 'loading');
    const failed = Boolean(songError) || [artists, albums, playlists].some(category => category.status === 'error');

    return <div>
        {(topArtists.length > 0 || artists.status === 'loading' || artists.status === 'error') && <section className="ty-section ty-artist-section">
            <SectionHeader title={t('search.tabArtist')} busy={artists.status === 'loading'} onMore={() => onSeeAll('artist')} />
            <SectionFailure error={artists.error} />
            {topArtists.slice(0, 1).map(hit => <SearchArtistRow key={`artist:${hit.id}`} hit={hit} onOpen={onOpenArtistHit} />)}
        </section>}

        {(topSongs.length > 0 || isSearching || songError) && <section className="ty-section">
            <SectionHeader title={t('search.tabSong', { defaultValue: '单曲' })} busy={isSearching && topSongs.length === 0} onMore={songs.length > 0 ? () => onSeeAll('song') : undefined} />
            <SectionFailure error={songError} />
            {topSongs.map(track => <SearchResultRow
                key={`song:${track.sourceRef?.kind}:${track.id}`}
                track={track}
                style={{ height: 56 }}
                isDaylight={isDaylight}
                onPlayTrack={onPlayTrack}
                onAddTrackToQueue={onAddTrackToQueue}
                onOpenArtist={onOpenArtist}
                onOpenAlbum={onOpenAlbum}
            />)}
        </section>}

        {(topPlaylists.length > 0 || playlists.status === 'loading' || playlists.status === 'error') && <section className="ty-section">
            <SectionHeader title={t('search.tabPlaylist', { defaultValue: '歌单' })} busy={playlists.status === 'loading'} onMore={() => onSeeAll('playlist')} />
            <SectionFailure error={playlists.error} />
            {topPlaylists.map(hit => <SearchPlaylistRow key={`playlist:${hit.id}`} hit={hit} onOpen={onOpenPlaylistHit} />)}
        </section>}

        {(topAlbums.length > 0 || albums.status === 'loading' || albums.status === 'error') && <section className="ty-section">
            <SectionHeader title={t('search.tabAlbum', { defaultValue: '专辑' })} busy={albums.status === 'loading'} onMore={() => onSeeAll('album')} />
            <SectionFailure error={albums.error} />
            {topAlbums.map(hit => <SearchAlbumRow key={`album:${hit.id}`} hit={hit} onOpen={onOpenAlbumHit} />)}
        </section>}

        {!hasAnything && !busy && !failed && <p className="ty-search-empty">{t('home.noResults')}</p>}
    </div>;
}

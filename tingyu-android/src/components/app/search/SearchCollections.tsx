import React from 'react';
import { ChevronRight, Disc3, ListMusic, Loader2, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SearchAlbumHit, SearchArtistHit, SearchPlaylistHit } from '../../../types/search';
import { getSizedCoverUrl } from '../../../utils/coverUrl';

// src/components/app/search/SearchCollections.tsx
// 歌手 / 专辑 / 歌单的搜索结果行。三类共用一套间距与字号，但图标形状不同：
// 歌手是圆形头像，专辑与歌单是圆角封面。

const metaLine = (...parts: Array<string | undefined>) => parts.filter(Boolean).join(' · ');

export const SearchArtistRow: React.FC<{ hit: SearchArtistHit; onOpen: (hit: SearchArtistHit) => void }> = ({ hit, onOpen }) => {
    const cover = getSizedCoverUrl(hit.coverUrl, 160);
    const meta = hit.description || metaLine(
        hit.albumCount !== undefined ? `${hit.albumCount} 张专辑` : undefined,
        hit.songCount !== undefined ? `${hit.songCount} 首歌` : undefined,
    );
    return <button type="button" className="ty-row" onClick={() => onOpen(hit)}>
        <span className="ty-row-art" data-round="true">{cover ? <img src={cover} alt="" loading="lazy" /> : <UserRound size={20} />}</span>
        <span className="ty-row-copy"><span className="ty-row-title">{hit.name}</span>{meta && <span className="ty-row-meta">{meta}</span>}</span>
        <ChevronRight className="ty-row-chevron" size={18} />
    </button>;
};

export const SearchAlbumRow: React.FC<{ hit: SearchAlbumHit; onOpen: (hit: SearchAlbumHit) => void }> = ({ hit, onOpen }) => {
    const cover = getSizedCoverUrl(hit.coverUrl, 160);
    return <button type="button" className="ty-row" onClick={() => onOpen(hit)}>
        <span className="ty-row-art">{cover ? <img src={cover} alt="" loading="lazy" /> : <Disc3 size={20} />}</span>
        <span className="ty-row-copy">
            <span className="ty-row-title">{hit.name}</span>
            <span className="ty-row-meta">{metaLine(hit.artistName, hit.releaseDate, hit.trackCount !== undefined ? `${hit.trackCount} 首` : undefined)}</span>
        </span>
        <ChevronRight className="ty-row-chevron" size={18} />
    </button>;
};

export const SearchPlaylistRow: React.FC<{ hit: SearchPlaylistHit; onOpen: (hit: SearchPlaylistHit) => void }> = ({ hit, onOpen }) => {
    const cover = getSizedCoverUrl(hit.coverUrl, 160);
    return <button type="button" className="ty-row" onClick={() => onOpen(hit)}>
        <span className="ty-row-art">{cover ? <img src={cover} alt="" loading="lazy" /> : <ListMusic size={20} />}</span>
        <span className="ty-row-copy">
            <span className="ty-row-title">{hit.name}</span>
            <span className="ty-row-meta">{metaLine(hit.creatorName, hit.trackCount !== undefined ? `${hit.trackCount} 首` : undefined)}</span>
        </span>
        <ChevronRight className="ty-row-chevron" size={18} />
    </button>;
};

/** 分类页的加载 / 空 / 失败状态；失败时保留已加载条目，只补一条可重试说明。 */
export const SearchCategoryStatus: React.FC<{
    status: 'idle' | 'loading' | 'ready' | 'error';
    empty: boolean;
    error: string | null;
    onRetry: () => void;
}> = ({ status, empty, onRetry }) => {
    const { t } = useTranslation();
    if (status === 'error') {
        // 桥接 / 上游的英文原文只进控制台；界面只给可读的中文状态。
        return <div className="ty-search-note" role="status">
            {t('search.categoryFailed', { defaultValue: '这一类暂时加载失败。' })}
            <button type="button" onClick={onRetry} style={{ marginLeft: 10, textDecoration: 'underline' }}>{t('search.retry')}</button>
        </div>;
    }
    if (status === 'loading' && empty) {
        return <div className="ty-search-empty"><Loader2 className="animate-spin" size={20} /></div>;
    }
    if (status === 'ready' && empty) {
        return <p className="ty-search-empty">{t('home.noResults')}</p>;
    }
    return null;
};

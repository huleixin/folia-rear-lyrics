import type { SearchAlbumHit, SearchArtistHit, SearchPlaylistHit, SearchSuggestion, SearchSuggestions } from '../../types/search';

// src/services/search/normalizeHits.ts
// 各音源「搜索条目 → 听屿搜索模型」的纯映射。放在这里而不是 provider 内部，是为了能用真实响应
// 做单元测试：字段缺失时返回 null（不补造名字或 id），有 id 才产出可点击的条目。

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const count = (value: unknown): number | undefined => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

// ---- QQ 音乐：/search?type=singer|album|playlist 与 /getSmartbox ----

export const normalizeQqArtistHit = (item: any): SearchArtistHit | null => {
    const id = text(item?.singerMID) || String(item?.singerID ?? '');
    const name = text(item?.singerName) || text(item?.title);
    if (!id || !name) return null;
    return {
        providerId: 'qq', id, name,
        coverUrl: text(item?.singerPic) || undefined,
        description: text(item?.subtitle) || undefined,
        songCount: count(item?.songNum), albumCount: count(item?.albumNum),
    };
};

export const normalizeQqAlbumHit = (item: any): SearchAlbumHit | null => {
    const id = text(item?.albummid) || String(item?.id ?? '');
    const name = text(item?.name);
    if (!id || !name) return null;
    return {
        providerId: 'qq', id, name,
        coverUrl: text(item?.pic) || undefined,
        artistName: text(item?.singer) || undefined,
        releaseDate: text(item?.publish_date) || undefined,
        trackCount: count(item?.song_num) || undefined,
    };
};

export const normalizeQqPlaylistHit = (item: any): SearchPlaylistHit | null => {
    const id = String(item?.dissid ?? '');
    const name = text(item?.dissname);
    if (!id || !name) return null;
    return {
        providerId: 'qq', id, name,
        coverUrl: text(item?.logo) || undefined,
        creatorName: text(item?.nickname) || undefined,
        trackCount: count(item?.songnum), playCount: count(item?.listennum),
    };
};

/** smartbox：只映射它真正给出的歌手 / 单曲 / 专辑；没有搜索词数组就不产生 keyword 条目。 */
export const normalizeQqSuggestions = (payload: any): SearchSuggestions => {
    const data = payload?.response?.data ?? payload?.data;
    if (!data || typeof data !== 'object') return { items: [] };
    const items: SearchSuggestion[] = [];
    const singer = data.singer?.itemlist?.[0];
    const singerId = text(singer?.mid) || String(singer?.id ?? '');
    const singerName = text(singer?.name);
    if (singerId && singerName) {
        items.push({ kind: 'artist', hit: { providerId: 'qq', id: singerId, name: singerName, coverUrl: text(singer?.pic) || undefined } });
    }
    for (const song of (Array.isArray(data.song?.itemlist) ? data.song.itemlist.slice(0, 4) : [])) {
        const name = text(song?.name);
        const id = text(song?.mid) || String(song?.id ?? '');
        if (name && id) items.push({ kind: 'song', id, name, artistName: text(song?.singer) || undefined });
    }
    for (const album of (Array.isArray(data.album?.itemlist) ? data.album.itemlist.slice(0, 2) : [])) {
        const name = text(album?.name);
        const id = text(album?.mid) || String(album?.id ?? '');
        if (name && id) items.push({ kind: 'album', hit: { providerId: 'qq', id, name, coverUrl: text(album?.pic) || undefined, artistName: text(album?.singer) || undefined } });
    }
    return { items };
};

// ---- 网易云：/cloudsearch?type=100|10|1000 与 /search/suggest ----

export const normalizeNeteaseArtistHit = (item: any): SearchArtistHit | null => {
    const id = String(item?.id ?? '');
    const name = text(item?.name);
    if (!id || !name) return null;
    const songCount = count(item?.musicSize);
    const albumCount = count(item?.albumSize);
    const description = [
        albumCount !== undefined ? `${albumCount} 张专辑` : '',
        songCount !== undefined ? `${songCount} 首歌` : '',
    ].filter(Boolean).join(' · ');
    return {
        providerId: 'netease', id, name,
        coverUrl: text(item?.picUrl) || undefined,
        songCount, albumCount,
        description: description || undefined,
    };
};

export const normalizeNeteaseAlbumHit = (item: any): SearchAlbumHit | null => {
    const id = String(item?.id ?? '');
    const name = text(item?.name);
    if (!id || !name) return null;
    const publish = Number(item?.publishTime);
    return {
        providerId: 'netease', id, name,
        coverUrl: text(item?.picUrl) || undefined,
        artistName: text(item?.artist?.name) || undefined,
        releaseDate: Number.isFinite(publish) && publish > 0 ? new Date(publish).toISOString().slice(0, 10) : undefined,
        trackCount: count(item?.size),
    };
};

export const normalizeNeteasePlaylistHit = (item: any): SearchPlaylistHit | null => {
    const id = String(item?.id ?? '');
    const name = text(item?.name);
    if (!id || !name) return null;
    return {
        providerId: 'netease', id, name,
        coverUrl: text(item?.coverImgUrl) || undefined,
        creatorName: text(item?.creator?.nickname) || undefined,
        trackCount: count(item?.trackCount), playCount: count(item?.playCount),
    };
};

export const normalizeNeteaseSuggestions = (payload: any): SearchSuggestions => {
    const result = payload?.result ?? null;
    if (!result) return { items: [] };
    const items: SearchSuggestion[] = [];
    const artist = result.artists?.[0];
    if (artist?.id && text(artist.name)) {
        items.push({ kind: 'artist', hit: { providerId: 'netease', id: String(artist.id), name: text(artist.name), coverUrl: text(artist.picUrl) || undefined } });
    }
    for (const entry of (Array.isArray(result.allMatch) ? result.allMatch : [])) {
        const keyword = text(entry?.keyword);
        if (keyword) items.push({ kind: 'keyword', text: keyword });
    }
    return { items };
};

/** 把 QQ/网易云的分页响应折算成统一的 hasMore / nextOffset；总数缺失时按本页是否满页判断。 */
export const pageFromItems = <T>(items: T[], total: number | undefined, offset: number, pageSize: number, upstreamMore?: boolean) => {
    const nextOffset = offset + items.length;
    const hasMore = typeof upstreamMore === 'boolean'
        ? upstreamMore
        : total === undefined ? items.length >= pageSize : nextOffset < total;
    return { items, ...(total === undefined ? {} : { total }), hasMore, nextOffset };
};

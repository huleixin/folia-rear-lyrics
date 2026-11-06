import type { SongResult } from '../types';

// src/utils/localPlaylistView.ts
/**
 * 本地歌单详情的「视图排序」纯规则（阶段二）。
 *
 * 关键边界：排序只影响歌单详情页的展示顺序；歌单真正的存储顺序（songIds）
 * 只有用户在「默认顺序」下做上移/下移时才会通过 reorderLocalPlaylistSongs 改动。
 * 也就是说换排序方式永远不会悄悄重写用户的手动排序。
 */

export type LocalPlaylistSortField = 'default' | 'name' | 'artist' | 'addedAt';
export type LocalPlaylistSortDirection = 'asc' | 'desc';

/** 歌单里一首歌的稳定引用：与 collectionMutationCapabilities 的删除语义一致。 */
export const playlistSongIdOf = (track: SongResult): string => (
    (track as { localRef?: { songId?: string } }).localRef?.songId || String(track.id)
);

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const artistNameOf = (track: SongResult): string => (
    (track.artists || []).map(artist => artist.name).filter(Boolean).join(', ')
);

const addedAtOf = (
    track: SongResult,
    addedAtById: Readonly<Record<string, number>>,
): number => addedAtById[playlistSongIdOf(track)] ?? 0;

/**
 * 按字段排序歌单视图。`default` 原样返回（存储顺序），其余字段 direction 反转时整体倒序。
 * addedAt 取歌曲加入本地曲库的时间（LocalSong.addedAt，经 addedAtById 映射）。
 */
export const sortPlaylistTracks = (
    tracks: readonly SongResult[],
    field: LocalPlaylistSortField,
    direction: LocalPlaylistSortDirection,
    addedAtById: Readonly<Record<string, number>>,
): SongResult[] => {
    if (field === 'default') return [...tracks];
    const factor = direction === 'desc' ? -1 : 1;
    return [...tracks].sort((left, right) => {
        if (field === 'name') return factor * collator.compare(left.name || '', right.name || '');
        if (field === 'artist') {
            return factor * collator.compare(artistNameOf(left), artistNameOf(right));
        }
        return factor * (addedAtOf(left, addedAtById) - addedAtOf(right, addedAtById));
    });
};

/**
 * 「添加歌曲」候选列表：曲库里还不在该歌单中的歌，按歌名排序。
 * 歌单内已有的歌绝不允许出现在候选里（数据层也有去重兜底，这里保证界面不出现假选项）。
 */
export const buildPlaylistAddCandidates = (
    localSongs: readonly { id: string; title: string; }[],
    existingSongIds: readonly string[],
): Array<{ id: string; title: string; }> => {
    const existing = new Set(existingSongIds);
    return localSongs
        .filter(song => !existing.has(song.id))
        .map(song => ({ id: song.id, title: song.title || song.id }))
        .sort((left, right) => collator.compare(left.title, right.title));
};

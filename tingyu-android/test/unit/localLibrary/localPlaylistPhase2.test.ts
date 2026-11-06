import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalSong } from '../../../src/types';

// test/unit/localLibrary/localPlaylistPhase2.test.ts
// 阶段二（歌单与收藏管理）的数据语义回归。数据层全部是既有 localPlaylistService，
// 这里锁定本阶段依赖的关键行为：按 id 增删（去重）、手动排序持久化、收藏开关、
// 以及「删除歌单绝不删除曲库歌曲」。

const makeSong = (id: string, title = `歌曲${id}`, albumName = '专辑', addedAt = 1000): LocalSong => ({
    id,
    fileName: `${id}.mp3`,
    filePath: `Music/${id}.mp3`,
    duration: 200_000,
    fileSize: 1,
    mimeType: 'audio/mpeg',
    addedAt,
    title,
    titleOrigin: 'import',
    importedMetadata: { title, titleSource: 'filename', artistNames: ['歌手'], albumName },
    hasManualLyricSelection: false,
    noAutoMatch: false,
});

(globalThis as unknown as { window: unknown }).window = globalThis;

type PlaylistService = typeof import('../../../src/services/localPlaylistService');
let service: PlaylistService;

beforeAll(async () => {
    service = await import('../../../src/services/localPlaylistService');
});

beforeEach(async () => {
    vi.resetModules();
    // resetModules 后重新取一份模块（service 引用随之更新），并清空两张表。
    service = (await import('../../../src/services/localPlaylistService')) as PlaylistService;
    const { appDatabase } = await import('../../../src/services/appDatabase');
    await Promise.all([
        appDatabase.local_music.clear(),
        appDatabase.local_play_history.clear(),
    ]);
    await appDatabase.api_cache.clear();
    await appDatabase.user_cache.clear();
    await appDatabase.media_cache.clear();
    await appDatabase.metadata_cache.clear();
});

const seedSongs = async (songs: LocalSong[]) => {
    const { appDatabase } = await import('../../../src/services/appDatabase');
    await appDatabase.local_music.bulkPut(songs);
};

describe('按 songId 的歌单增删（阶段二菜单/面板走的数据通道）', () => {
    it('addLocalSongIdsToPlaylist：重复添加不产生第二条引用', async () => {
        await seedSongs([makeSong('s1'), makeSong('s2')]);
        const created = await service.createLocalPlaylistWithSongIds('我的歌单', ['s1']);
        await service.addLocalSongIdsToPlaylist(created.id, ['s1']);
        await service.addLocalSongIdsToPlaylist(created.id, ['s1', 's2']);

        const playlists = await service.getLocalPlaylists();
        const target = playlists.find(playlist => playlist.id === created.id);
        expect(target?.songIds).toEqual(['s1', 's2']);
    });

    it('createLocalPlaylistWithSongIds：允许空歌单存在', async () => {
        const created = await service.createLocalPlaylistWithSongIds('空歌单', []);
        const playlists = await service.getLocalPlaylists();
        const target = playlists.find(playlist => playlist.id === created.id);
        expect(target?.songIds).toEqual([]);
        expect(target?.name).toBe('空歌单');
    });

    it('reorderLocalPlaylistSongs：手动顺序写入并持久化（重读一致）', async () => {
        await seedSongs([makeSong('a'), makeSong('b'), makeSong('c')]);
        const created = await service.createLocalPlaylistWithSongIds('顺序', ['a', 'b', 'c']);
        await service.reorderLocalPlaylistSongs(created.id, ['c', 'a', 'b']);

        const playlists = await service.getLocalPlaylists();
        expect(playlists.find(playlist => playlist.id === created.id)?.songIds).toEqual(['c', 'a', 'b']);
    });

    it('removeSongsFromLocalPlaylist：按 songId 移除', async () => {
        await seedSongs([makeSong('a'), makeSong('b')]);
        const created = await service.createLocalPlaylistWithSongIds('X', ['a', 'b']);
        await service.removeSongsFromLocalPlaylist(created.id, ['a']);
        const playlists = await service.getLocalPlaylists();
        expect(playlists.find(playlist => playlist.id === created.id)?.songIds).toEqual(['b']);
    });

    it('deleteLocalPlaylist：只删歌单记录，本地曲库歌曲原样保留', async () => {
        await seedSongs([makeSong('a'), makeSong('b')]);
        const created = await service.createLocalPlaylistWithSongIds('将被删除', ['a']);
        await service.deleteLocalPlaylist(created.id);

        const playlists = await service.getLocalPlaylists();
        expect(playlists.some(playlist => playlist.id === created.id)).toBe(false);
        // 曲库歌曲一个不少 —— 删歌单绝不能删手机里的音乐文件。
        const { getLocalSongs } = await import('../../../src/services/db');
        const songs = await getLocalSongs();
        expect(songs.map(song => song.id).sort()).toEqual(['a', 'b']);
    });

    it('收藏「我喜欢」：同一事实源，开与关互逆；不影响普通歌单', async () => {
        await seedSongs([makeSong('fav1')]);
        const before = await service.getLocalPlaylists();
        const normalCount = before.filter(playlist => !playlist.isFavorite).length;

        await service.setLocalSongIdFavorite('fav1', true);
        const liked = await service.getFavoriteLocalPlaylist();
        expect(liked.songIds).toContain('fav1');

        await service.setLocalSongIdFavorite('fav1', false);
        const unliked = await service.getFavoriteLocalPlaylist();
        expect(unliked.songIds).not.toContain('fav1');

        const after = await service.getLocalPlaylists();
        expect(after.filter(playlist => !playlist.isFavorite).length).toBe(normalCount);
    });
});

describe('歌单视图排序（纯函数，只影响展示顺序）', () => {
    const tracks = [
        { id: '1', name: 'B歌', artists: [{ id: 'a1', name: '王歌手' }] },
        { id: '2', name: 'A歌', artists: [{ id: 'a2', name: '李歌手' }] },
        { id: '3', name: 'C歌', artists: [{ id: 'a3', name: '张歌手' }] },
    ] as unknown as import('../../../src/types').SongResult[];
    const addedAt = { '1': 300, '2': 100, '3': 200 };

    it('default 原样返回存储顺序（手动排序不被换排序方式破坏）', async () => {
        const { sortPlaylistTracks } = await import('../../../src/utils/localPlaylistView');
        const result = sortPlaylistTracks(tracks, 'default', 'asc', addedAt);
        expect(result.map(track => track.id)).toEqual(['1', '2', '3']);
    });

    it('name / artist / addedAt 三种字段升降序', async () => {
        const { sortPlaylistTracks } = await import('../../../src/utils/localPlaylistView');
        expect(sortPlaylistTracks(tracks, 'name', 'asc', addedAt).map(track => track.id)).toEqual(['2', '1', '3']);
        expect(sortPlaylistTracks(tracks, 'name', 'desc', addedAt).map(track => track.id)).toEqual(['3', '1', '2']);
        expect(sortPlaylistTracks(tracks, 'artist', 'asc', addedAt).map(track => track.id)).toEqual(['2', '1', '3']);
        expect(sortPlaylistTracks(tracks, 'addedAt', 'asc', addedAt).map(track => track.id)).toEqual(['2', '3', '1']);
    });

    it('addedAt 丢失的歌曲排到最后而不是报错', async () => {
        const { sortPlaylistTracks } = await import('../../../src/utils/localPlaylistView');
        const result = sortPlaylistTracks(tracks, 'addedAt', 'asc', {});
        expect(result).toHaveLength(3);
    });
});

describe('「添加歌曲」候选列表', () => {
    it('排除已在歌单中的歌，按歌名排序', async () => {
        const { buildPlaylistAddCandidates } = await import('../../../src/utils/localPlaylistView');
        const songs = [makeSong('a', '北'), makeSong('b', '阿'), makeSong('c', '丙')];
        const candidates = buildPlaylistAddCandidates(songs, ['a']);
        expect(candidates.map(song => song.id)).toEqual(['b', 'c']);
    });

    it('全部都在歌单里时候选为空（不出现假选项）', async () => {
        const { buildPlaylistAddCandidates } = await import('../../../src/utils/localPlaylistView');
        const songs = [makeSong('a', '北')];
        expect(buildPlaylistAddCandidates(songs, ['a'])).toEqual([]);
    });
});

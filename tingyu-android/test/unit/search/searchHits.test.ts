import { describe, expect, it } from 'vitest';
import {
    normalizeNeteaseAlbumHit,
    normalizeNeteaseArtistHit,
    normalizeNeteasePlaylistHit,
    normalizeNeteaseSuggestions,
    normalizeQqAlbumHit,
    normalizeQqArtistHit,
    normalizeQqPlaylistHit,
    normalizeQqSuggestions,
    pageFromItems,
} from '@/services/search/normalizeHits';
import { searchLocalPlaylists } from '@/services/search/deviceSearch';
import { exploreCapabilities, sourceSupportsSuggestions } from '@/stores/useSearchExploreStore';
import { resolveSearchCapabilities } from '@/types/onlineMusic';
import type { LocalPlaylist } from '@/types';

// test/unit/search/searchHits.test.ts
// QQ 的两组样本来自 2026-10-23 对项目内置 qq-music-api 3.3.1 的真实请求（关键词「许嵩」），此处只裁剪字段；
// 网易云样本按其公开响应的字段契约构造（本机环境访问上游超时，未能实测，见交付说明）。

describe('QQ 音乐搜索条目映射', () => {
    const singer = {
        singerID: 7221, singerMID: '000CK5xN3yZDJt', singerName: '许嵩',
        singerPic: 'http://y.gtimg.cn/music/photo_new/T001R150x150M000000CK5xN3yZDJt_3.jpg',
        songNum: 430, albumNum: 59, subtitle: '歌曲:430  专辑:59  视频:1481',
    };
    it('keeps the real mid, counts and artwork for an artist hit', () => {
        expect(normalizeQqArtistHit(singer)).toEqual({
            providerId: 'qq', id: '000CK5xN3yZDJt', name: '许嵩',
            coverUrl: singer.singerPic, description: '歌曲:430  专辑:59  视频:1481',
            songCount: 430, albumCount: 59,
        });
    });
    it('maps album cover, artist and publish date without inventing missing fields', () => {
        expect(normalizeQqAlbumHit({
            albummid: '001Oqn952HAPRk', name: '安泊猜想', singer: '许嵩',
            publish_date: '2026-06-16', pic: 'http://y.gtimg.cn/music/photo_new/T002R180x180M000001Oqn952HAPRk_1.jpg',
        })).toMatchObject({ id: '001Oqn952HAPRk', name: '安泊猜想', artistName: '许嵩', releaseDate: '2026-06-16' });
        expect(normalizeQqAlbumHit({ name: '缺 id 的专辑' })).toBeNull();
    });
    it('maps playlist creator and track count', () => {
        expect(normalizeQqPlaylistHit({
            dissid: '7039481526', dissname: '最动听的许嵩', nickname: '牧兮君', songnum: 89, listennum: 54885602,
            logo: 'http://y.gtimg.cn/music/photo_new/T001R500x500M000000CK5xN3yZDJt.jpg?n=1',
        })).toMatchObject({ id: '7039481526', name: '最动听的许嵩', creatorName: '牧兮君', trackCount: 89 });
    });
    it('builds suggestions from the smartbox sections it actually receives', () => {
        const result = normalizeQqSuggestions({
            response: {
                code: 0,
                data: {
                    singer: { itemlist: [{ mid: '000CK5xN3yZDJt', id: '7221', name: '许嵩', pic: 'p.jpg' }] },
                    song: { itemlist: [
                        { mid: '001bLkWD2EYA4P', name: '天龙八部之宿敌', singer: '许嵩' },
                        { mid: '003MUDkf30pS5B', name: '幻听', singer: '许嵩' },
                    ] },
                    album: { itemlist: [{ mid: '002KSDg90IaScI', name: '自定义', singer: '许嵩' }] },
                    mv: { itemlist: [{ mid: 'x', name: '不应出现' }] },
                },
            },
        });
        expect(result.items.map(item => item.kind)).toEqual(['artist', 'song', 'song', 'album']);
        expect(result.items[0]).toMatchObject({ kind: 'artist', hit: { name: '许嵩' } });
        expect(result.items[1]).toMatchObject({ kind: 'song', name: '天龙八部之宿敌' });
        expect(result.items[3]).toMatchObject({ kind: 'album', hit: { name: '自定义' } });
    });
    it('returns nothing rather than fake keywords when smartbox has no sections', () => {
        expect(normalizeQqSuggestions({ response: { data: {} } })).toEqual({ items: [] });
        expect(normalizeQqSuggestions(null)).toEqual({ items: [] });
    });
    it('accepts the bridge smartbox shape ({ data }) as well as the raw route shape', () => {
        const bridged = normalizeQqSuggestions({
            data: {
                singer: { itemlist: [{ mid: '000CK5xN3yZDJt', name: '许嵩' }] },
                song: { itemlist: [{ mid: '001bLkWD2EYA4P', name: '天龙八部之宿敌', singer: '许嵩' }] },
            },
        });
        expect(bridged.items.map(item => item.kind)).toEqual(['artist', 'song']);
    });
});

describe('网易云搜索条目映射（响应契约）', () => {
    it('maps artist counts into a readable description', () => {
        expect(normalizeNeteaseArtistHit({ id: 6452, name: '许嵩', picUrl: 'http://p1.jpg', albumSize: 59, musicSize: 430 }))
            .toMatchObject({ providerId: 'netease', id: '6452', name: '许嵩', albumCount: 59, songCount: 430, description: '59 张专辑 · 430 首歌' });
    });
    it('formats album publish time from epoch millis and keeps artist name', () => {
        expect(normalizeNeteaseAlbumHit({ id: 1, name: '自定义', picUrl: 'p', artist: { name: '许嵩' }, publishTime: 1196524800000, size: 9 }))
            .toMatchObject({ name: '自定义', artistName: '许嵩', releaseDate: '2007-12-01', trackCount: 9 });
    });
    it('keeps playlist creator and track count', () => {
        expect(normalizeNeteasePlaylistHit({ id: 2, name: '许嵩精选', coverImgUrl: 'c', creator: { nickname: '听屿' }, trackCount: 30 }))
            .toMatchObject({ name: '许嵩精选', creatorName: '听屿', trackCount: 30 });
    });
    it('maps allMatch keywords and the best-match artist', () => {
        const result = normalizeNeteaseSuggestions({ result: {
            artists: [{ id: 6452, name: '许嵩', picUrl: 'p' }],
            allMatch: [{ keyword: '许嵩' }, { keyword: '许嵩 天龙八部之宿敌' }],
        } });
        expect(result.items.map(item => item.kind)).toEqual(['artist', 'keyword', 'keyword']);
    });
});

describe('分页折算', () => {
    it('prefers the upstream more flag', () => {
        expect(pageFromItems([1, 2], 100, 0, 20, false)).toMatchObject({ hasMore: false, nextOffset: 2 });
        expect(pageFromItems([1, 2], 1, 0, 20, true)).toMatchObject({ hasMore: true });
    });
    it('falls back to total, then to page fullness', () => {
        expect(pageFromItems(Array.from({ length: 20 }, (_, i) => i), 40, 0, 20)).toMatchObject({ hasMore: true, nextOffset: 20 });
        expect(pageFromItems([1], undefined, 0, 20)).toMatchObject({ hasMore: false, nextOffset: 1 });
    });
});

describe('搜索能力来自实现而非音源名字', () => {
    it('reflects only implemented provider methods', () => {
        expect(resolveSearchCapabilities({ searchSongs: async () => ({ items: [], hasMore: false, nextOffset: 0 }) }))
            .toEqual({ song: true, artist: false, album: false, playlist: false, suggest: false, general: false });
    });
    it('declares local playlists and Navidrome artist/album, but no local artist/album pages', () => {
        expect(exploreCapabilities('local')).toEqual({ artist: false, album: false, playlist: true });
        expect(exploreCapabilities('navidrome')).toEqual({ artist: true, album: true, playlist: false });
    });
    it('never asks local or Navidrome for suggestions', () => {
        expect(sourceSupportsSuggestions('local')).toBe(false);
        expect(sourceSupportsSuggestions('navidrome')).toBe(false);
    });
});

describe('本地歌单搜索', () => {
    const playlists: LocalPlaylist[] = [
        { id: 'a', name: '夜航歌单', songIds: ['1', '2'], createdAt: 0, updatedAt: 0 },
        { id: 'b', name: '岛屿来信', songIds: ['3'], createdAt: 0, updatedAt: 0 },
    ];
    it('matches names and reports the real track count', () => {
        expect(searchLocalPlaylists('夜航', playlists, 20, 0)).toMatchObject({ items: [{ id: 'a', trackCount: 2 }], hasMore: false });
    });
    it('paginates and returns an empty page for no match', () => {
        expect(searchLocalPlaylists('歌', playlists, 1, 0)).toMatchObject({ total: 1, hasMore: false });
        expect(searchLocalPlaylists('不存在', playlists, 20, 0).items).toEqual([]);
    });
});

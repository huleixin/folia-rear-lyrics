import { beforeEach, describe, expect, it, vi } from 'vitest';
import { neteaseApi } from '@/services/netease';
import { neteaseProvider } from '@/services/onlineMusic/neteaseProvider';
import type { UnifiedSong } from '@/types';
import { OnlineProviderError } from '@/types/onlineMusic';
import { parseLyricsAsync } from '@/utils/lyrics/workerClient';

// test/unit/onlineMusic/neteaseProvider.test.ts

vi.mock('@/services/netease', () => ({
    isSongMarkedUnavailable: (candidate: UnifiedSong) => candidate.privilege?.st === -200,
    getNeteaseRemoteApiBase: () => null,
    neteaseApi: {
        normalizeSongResult: vi.fn((raw: unknown) => raw),
        getSongUrl: vi.fn(),
        getLyric: vi.fn(),
        getUnavailableSongReplacement: vi.fn(),
        cloudSearch: vi.fn(),
        getAlbum: vi.fn(),
        getArtistDetail: vi.fn(),
        getArtistAlbums: vi.fn(),
        getPersonalizedPlaylists: vi.fn(),
        getLikedSongs: vi.fn(),
        getUserPlaylists: vi.fn(),
        checkQr: vi.fn(),
        getQrKey: vi.fn(),
        createQr: vi.fn(),
        scrobbleV1: vi.fn(),
        likeSong: vi.fn(),
    },
}));

vi.mock('@/utils/lyrics/workerClient', () => ({
    parseLyricsAsync: vi.fn(),
}));

const song: UnifiedSong = {
    id: 42,
    name: 'Song',
    artists: [],
    album: { id: 1, name: 'Album' },
    durationMs: 1000,
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: '42' },
};

describe('neteaseProvider', () => {
    beforeEach(() => vi.clearAllMocks());

    // 现场问题：界面提示「收藏成功」，收藏里却没有这首歌。
    // 桥在「写完复查发现没生效」时会回 { error: 'LIKE_NOT_APPLIED: …' }，
    // provider 必须把它抛出去 —— 否则 omni 会把这次调用当成功并翻转本地缓存。
    it('throws when the bridge reports the like did not take effect', async () => {
        vi.mocked(neteaseApi.likeSong).mockResolvedValue({
            error: 'LIKE_NOT_APPLIED: /api/radio/like 后关系仍是 false',
        } as any);

        await expect(neteaseProvider.mutations!.likeSong!(song, true)).rejects.toBeInstanceOf(OnlineProviderError);
    });

    it('resolves when the bridge confirmed the like', async () => {
        vi.mocked(neteaseApi.likeSong).mockResolvedValue({
            liked: true,
            code: 200,
            via: '/api/song/like',
        } as any);

        await expect(neteaseProvider.mutations!.likeSong!(song, true)).resolves.toBeUndefined();
    });

    it('maps semantic high quality to the NetEase exhigh value', async () => {
        vi.mocked(neteaseApi.getSongUrl).mockResolvedValue({ data: [{ url: 'http://music.test/song.mp3' }] } as any);
        await expect(neteaseProvider.playback!.getAudioSource(song, 'high')).resolves.toMatchObject({
            url: 'https://music.test/song.mp3',
            quality: 'high',
        });
        expect(neteaseApi.getSongUrl).toHaveBeenCalledWith(42, 'exhigh');
    });

    it('maps NetEase track gain from the URL response and keeps negative dB values', async () => {
        vi.mocked(neteaseApi.getSongUrl).mockResolvedValue({
            data: [{ url: 'https://music.test/song.flac', gain: -7.25 }],
        } as any);

        await expect(neteaseProvider.playback!.getAudioSource(song, 'lossless')).resolves.toMatchObject({
            replayGain: { trackGain: -7.25 },
        });
    });

    it('does not create ReplayGain metadata when NetEase omits gain', async () => {
        vi.mocked(neteaseApi.getSongUrl).mockResolvedValue({
            data: [{ url: 'https://music.test/song.mp3' }],
        } as any);

        const source = await neteaseProvider.playback!.getAudioSource(song, 'high');

        expect(source?.replayGain).toBeUndefined();
    });

    it('exposes NetEase romanization alongside the parsed lyric result', async () => {
        vi.mocked(parseLyricsAsync).mockResolvedValue({
            lines: [{
                words: [],
                fullText: '君のことが好き',
                startTime: 1,
                endTime: 2,
                translation: '我喜欢你',
                romanization: 'Kimi no koto ga suki',
            }],
        });
        vi.mocked(neteaseApi.getLyric).mockResolvedValue({
            lrc: { lyric: '[00:01.00]君のことが好き' },
            tlyric: { lyric: '[00:01.00]我喜欢你' },
            romalrc: { lyric: '[00:01.00]Kimi no koto ga suki' },
        } as any);

        await expect(neteaseProvider.lyrics!.getLyrics(song)).resolves.toMatchObject({
            romanizationText: '[00:01.00]Kimi no koto ga suki',
            lyrics: {
                lines: [{
                    translation: '我喜欢你',
                    romanization: 'Kimi no koto ga suki',
                }],
            },
        });
    });

    it('normalizes search results and paging metadata', async () => {
        vi.mocked(neteaseApi.cloudSearch).mockResolvedValue({
            result: { songs: [{ ...song, sourceRef: undefined }], songCount: 2 },
        } as any);
        const page = await neteaseProvider.search!.searchSongs('song', 1, 0);
        expect(page.items[0].sourceRef).toEqual({ kind: 'online', providerId: 'netease', mediaId: '42' });
        expect(page).toMatchObject({ total: 2, hasMore: true, nextOffset: 1 });
    });

    it('normalizes album collection metadata into provider fields', async () => {
        vi.mocked(neteaseApi.getArtistAlbums).mockResolvedValue({
            hotAlbums: [{
                id: 7,
                name: 'Album',
                picUrl: 'https://example.test/album.jpg',
                artist: { id: 9, name: 'Artist' },
                alias: ['Alias'],
                publishTime: 1704067200000,
                company: 'Publisher',
            }],
            more: false,
        } as any);

        const page = await neteaseProvider.catalog!.getArtistAlbums!(9, 10, 0);
        expect(page.items[0]).toMatchObject({
            id: 7,
            coverUrl: 'https://example.test/album.jpg',
            artists: [{ id: 9, name: 'Artist' }],
            aliases: ['Alias'],
            publishedAt: 1704067200000,
            publisher: 'Publisher',
        });
    });

    it('normalizes artist and full album biographies into the unified description field', async () => {
        vi.mocked(neteaseApi.getArtistDetail).mockResolvedValue({
            data: {
                artist: {
                    id: 9,
                    name: 'Artist',
                    briefDesc: 'Artist biography',
                    musicSize: 12,
                    albumSize: 3,
                },
            },
        } as any);
        vi.mocked(neteaseApi.getAlbum).mockResolvedValue({
            album: {
                id: 7,
                name: 'Album',
                picUrl: 'https://example.test/album.jpg',
                briefDesc: 'Album biography',
                artist: { id: 9, name: 'Artist' },
                size: 10,
            },
            songs: [],
        } as any);

        await expect(neteaseProvider.catalog!.getArtistDetail!(9)).resolves.toMatchObject({
            description: 'Artist biography',
        });
        await expect(neteaseProvider.catalog!.getAlbumDetail!(7)).resolves.toMatchObject({
            description: 'Album biography',
            artists: [{ id: 9, name: 'Artist' }],
        });
    });

    it('maps personalized playlist copywriter into the unified description field', async () => {
        vi.mocked(neteaseApi.getPersonalizedPlaylists).mockResolvedValue({
            result: [{
                id: 7,
                name: 'Recommended Playlist',
                picUrl: 'https://example.test/playlist.jpg',
                copywriter: '猜你喜欢的歌单',
            }],
        } as any);

        const collections = await neteaseProvider.recommendations!.getRecommendedCollections!(10);
        expect(collections[0]).toMatchObject({
            name: 'Recommended Playlist',
            description: '猜你喜欢的歌单',
        });
    });

    it('rejects with a network OmniError when the song URL request never reached the API', async () => {
        const tagged = Object.assign(
            new Error('NetEase API request /song/url/v1 failed: fetch failed', { cause: new TypeError('fetch failed') }),
            { networkFailure: true },
        );
        vi.mocked(neteaseApi.getSongUrl).mockRejectedValue(tagged);

        await expect(neteaseProvider.playback!.getAudioSource(song, 'high')).rejects.toMatchObject({
            name: 'OnlineProviderError',
            code: 'network',
            providerId: 'netease',
            message: 'NetEase API request /song/url/v1 failed: fetch failed',
            cause: tagged,
            details: { stage: 'song-url' },
        });
    });

    it('rejects a non-JSON 5xx body as service-unavailable with the HTTP status', async () => {
        vi.mocked(neteaseApi.getSongUrl).mockRejectedValue(
            Object.assign(new Error('NetEase API /song/url/v1 returned HTTP 503 without a JSON body: (empty)'), { httpStatus: 503 }),
        );

        await expect(neteaseProvider.playback!.getAudioSource(song, 'high')).rejects.toMatchObject({
            code: 'service-unavailable',
            httpStatus: 503,
        });
    });

    it.each([
        [{ code: 200, data: [{ url: null, code: -110, fee: 1 }] }, 'membership-required'],
        [{ code: 200, data: [{ url: null, code: -110, fee: 4 }] }, 'purchase-required'],
        [{ code: 200, data: [{ url: 'http://music.test/clip.mp3', freeTrialInfo: { start: 0, end: 30 } }] }, 'preview-only'],
        [{ code: 200, data: [{ url: null, code: 404 }] }, 'not-playable'],
        [{ code: 502, msg: 'read ECONNRESET' }, 'network'],
        [{ code: 301, msg: '需要登录' }, 'auth-required'],
        [{ code: 200, data: [] }, 'invalid-response'],
    ])('rejects an unplayable song URL response %j as %s instead of returning null', async (response, code) => {
        vi.mocked(neteaseApi.getSongUrl).mockResolvedValue(response as any);

        await expect(neteaseProvider.playback!.getAudioSource(song, 'high')).rejects.toMatchObject({
            code,
            providerId: 'netease',
        });
        // 只请求一次：不做客户端音质回退。
        expect(neteaseApi.getSongUrl).toHaveBeenCalledTimes(1);
    });

    it('decides availability from the privilege itself, not from isSongMarkedUnavailable', () => {
        // L10 的 mock 只认 st === -200；新逻辑对 -300 给 unknown，对有可播档位的 -200 也给 unknown。
        expect(neteaseProvider.playback!.getAvailability!({ ...song, privilege: { st: -300 } })).toEqual({
            state: 'unknown',
            reason: 'restricted',
        });
        expect(neteaseProvider.playback!.getAvailability!({ ...song, privilege: { st: -200, pl: 320000 } })).toEqual({
            state: 'unknown',
            reason: 'restricted',
        });
        expect(neteaseProvider.playback!.getAvailability!({ ...song, privilege: { st: -200, cs: true } })).toEqual({
            state: 'unknown',
            reason: 'restricted',
        });
        expect(neteaseProvider.playback!.getAvailability!({
            ...song,
            privilege: { st: -200 },
            noCopyrightRcmd: { typeDesc: '其它版本可播' },
        })).toEqual({ state: 'unavailable', reason: 'taken-down', label: '其它版本可播' });
        expect(neteaseProvider.playback!.getAvailability!(song)).toEqual({ state: 'playable' });
    });

    it('wraps a failed replacement lookup into an OmniError', async () => {
        const unavailableSong = { ...song, privilege: { st: -200 } };
        vi.mocked(neteaseApi.getUnavailableSongReplacement).mockRejectedValueOnce(
            Object.assign(new Error('NetEase API request /song/copyright/rcmd failed: fetch failed'), { networkFailure: true }),
        );
        await expect(neteaseProvider.playback!.getReplacement!(unavailableSong)).rejects.toMatchObject({
            name: 'OnlineProviderError',
            code: 'network',
            providerId: 'netease',
            details: { stage: 'replacement' },
        });

        const omniError = new OnlineProviderError('timeout', 'NetEase upstream request failed', 'netease');
        vi.mocked(neteaseApi.getUnavailableSongReplacement).mockRejectedValueOnce(omniError);
        await expect(neteaseProvider.playback!.getReplacement!(unavailableSong)).rejects.toBe(omniError);
    });

    it('owns unavailable status and replacement normalization inside the provider', async () => {
        const unavailableSong = { ...song, privilege: { st: -200 } };
        expect(neteaseProvider.playback!.getAvailability!(unavailableSong)).toMatchObject({
            state: 'unavailable',
        });

        vi.mocked(neteaseApi.getUnavailableSongReplacement).mockResolvedValue({
            replacementSong: { ...song, id: 43 },
            replacementSongId: 43,
            typeDesc: '版权替代版本',
        } as any);
        await expect(neteaseProvider.playback!.getReplacement!(unavailableSong)).resolves.toMatchObject({
            label: '版权替代版本',
            song: { id: 43, sourceRef: { providerId: 'netease', mediaId: '43' } },
        });
    });

    it.each([
        [801, 'waiting'],
        [802, 'scanned'],
        [803, 'confirmed'],
        [800, 'expired'],
    ])('maps QR code %s to %s', async (code, state) => {
        vi.mocked(neteaseApi.checkQr).mockResolvedValue({ code } as any);
        await expect(neteaseProvider.auth!.checkQr!('key')).resolves.toMatchObject({ state });
    });

    it('keeps the backend code and message on an unmapped QR response', async () => {
        vi.mocked(neteaseApi.checkQr).mockResolvedValue({ code: 8821, message: '需要行为验证码验证' } as any);
        await expect(neteaseProvider.auth!.checkQr!('key')).resolves.toEqual({
            state: 'error',
            message: 'code 8821: 需要行为验证码验证',
            detail: { code: 8821, message: '需要行为验证码验证' },
        });
    });

    it.each(['read ECONNRESET', 'socket hang up', 'Client network socket disconnected before secure TLS connection was established'])(
        'marks a QR poll the upstream reset (%s) as a transient connection-reset',
        async msg => {
            vi.mocked(neteaseApi.checkQr).mockResolvedValue({ code: 502, msg } as any);
            await expect(neteaseProvider.auth!.checkQr!('key')).resolves.toEqual({
                state: 'error', message: `code 502: ${msg}`, reason: 'connection-reset', transient: true, detail: { code: 502, message: msg },
            });
        },
    );

    it('marks other network failures as transient and keeps their text as written', async () => {
        vi.mocked(neteaseApi.checkQr).mockResolvedValue({ code: 502, msg: 'connect ECONNREFUSED 127.0.0.1:7890' } as any);
        await expect(neteaseProvider.auth!.checkQr!('key')).resolves.toEqual({
            state: 'error',
            message: 'code 502: connect ECONNREFUSED 127.0.0.1:7890',
            transient: true,
            detail: { code: 502, message: 'connect ECONNREFUSED 127.0.0.1:7890' },
        });
    });

    it('throws instead of handing out an empty QR key, carrying the backend response', async () => {
        vi.mocked(neteaseApi.getQrKey).mockResolvedValue({ code: 200, data: { unikey: 'k1' } } as any);
        await expect(neteaseProvider.auth!.getQrKey!()).resolves.toBe('k1');

        const reset = { code: 502, msg: 'read ECONNRESET' };
        vi.mocked(neteaseApi.getQrKey).mockResolvedValue(reset as any);
        await expect(neteaseProvider.auth!.getQrKey!()).rejects.toMatchObject({
            code: 'invalid-response',
            message: 'NetEase QR key request failed: code 502: read ECONNRESET',
            qrLoginReason: 'connection-reset',
            transient: true,
            cause: reset,
        });

        vi.mocked(neteaseApi.getQrKey).mockResolvedValue({ code: 502, msg: 'connect ETIMEDOUT 59.111.181.35:443' } as any);
        const error = await neteaseProvider.auth!.getQrKey!().catch((caught: unknown) => caught);
        expect(error).toMatchObject({ code: 'invalid-response', message: 'NetEase QR key request failed: code 502: connect ETIMEDOUT 59.111.181.35:443' });
        expect(error).not.toHaveProperty('qrLoginReason');
    });

    it('fails instead of handing out an empty QR image', async () => {
        vi.mocked(neteaseApi.createQr).mockResolvedValue({ code: 200, data: { qrimg: 'data:image/png;base64,AAAA' } } as any);
        await expect(neteaseProvider.auth!.createQr!('k1')).resolves.toBe('data:image/png;base64,AAAA');

        vi.mocked(neteaseApi.createQr).mockResolvedValue({ code: 400, msg: 'key is required' } as any);
        await expect(neteaseProvider.auth!.createQr!('k1')).rejects.toMatchObject({
            code: 'invalid-response',
            message: 'NetEase QR image request failed: code 400: key is required',
        });
    });
});

// 网易云 `/user/playlist` 的「我喜欢的音乐」是 `specialType: 5`（数字）；首页特殊集合靠 isLiked 认它。
describe('neteaseProvider user playlists', () => {
    beforeEach(() => vi.clearAllMocks());

    it('marks its own specialType 5 playlist as liked and leaves the rest alone', async () => {
        vi.mocked(neteaseApi.getUserPlaylists).mockResolvedValue({
            playlist: [
                { id: 11, name: 'amtx喜欢的音乐', specialType: 5, subscribed: false, creator: { userId: 7, nickname: 'amtx' } },
                { id: 12, name: '自建歌单', specialType: 0, subscribed: false, creator: { userId: 7, nickname: 'amtx' } },
                // 收藏来的别人的「喜欢的音乐」也是 5：不能当成自己的（移除会变成取消自己的喜欢）。
                { id: 13, name: '别人喜欢的音乐', specialType: 5, subscribed: true, creator: { userId: 8, nickname: 'other' } },
            ],
        } as any);

        const page = await neteaseProvider.library!.getUserPlaylists!(7, 30, 0);

        expect(neteaseApi.getUserPlaylists).toHaveBeenCalledWith(7, 30, 0);
        expect(page.items.map(item => [item.id, item.isLiked])).toEqual([[11, true], [12, undefined], [13, undefined]]);
        // 归一化结果进缓存后回灌（omni.normalizeCachedCollection）仍是「我喜欢的音乐」。
        expect(neteaseProvider.normalizeCollection!(page.items[0]).isLiked).toBe(true);
        expect(neteaseProvider.normalizeCollection!(page.items[1]).isLiked).toBeUndefined();
    });
});

describe('neteaseProvider liked song ids', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns the ids of a successful response', async () => {
        vi.mocked(neteaseApi.getLikedSongs).mockResolvedValue({ code: 200, ids: [1, 2, 3] } as any);
        await expect(neteaseProvider.library!.getLikedSongIds!(7)).resolves.toEqual([1, 2, 3]);
        expect(neteaseApi.getLikedSongs).toHaveBeenCalledWith(7);
    });

    it('keeps an empty list when the account really likes nothing', async () => {
        vi.mocked(neteaseApi.getLikedSongs).mockResolvedValue({ code: 200, ids: [] } as any);
        await expect(neteaseProvider.library!.getLikedSongIds!(7)).resolves.toEqual([]);
    });

    // An error body must not read as "likes nothing": the caller would clear every heart.
    it.each([
        ['a server error', { code: 502 }, 'unavailable'],
        ['a missing ids list', { code: 200 }, 'unavailable'],
        ['no status code', { msg: 'busy' }, 'unavailable'],
        ['a signed-out session', { code: 301 }, 'auth-required'],
    ])('rejects %s instead of answering with no likes', async (_label, response, errorCode) => {
        vi.mocked(neteaseApi.getLikedSongs).mockResolvedValue(response as any);
        await expect(neteaseProvider.library!.getLikedSongIds!(7)).rejects.toMatchObject({ code: errorCode });
    });
});

describe('neteaseProvider listening reports', () => {
    const reported: UnifiedSong = {
        ...song,
        name: '歌名',
        artists: [{ id: 7, name: '歌手 A' }, { id: 8, name: '歌手 B' }],
    };

    beforeEach(() => vi.clearAllMocks());

    it('sends the played seconds and never a source id', async () => {
        vi.mocked(neteaseApi.scrobbleV1).mockResolvedValue({ code: 200 } as any);

        await neteaseProvider.playbackReports!.reportPlayback(reported, {
            playedSeconds: 45.6,
            totalSeconds: 240,
            quality: 'high',
        });

        const params = vi.mocked(neteaseApi.scrobbleV1).mock.calls[0][0];
        expect(params).toEqual({
            id: 42,
            time: 46,
            name: '歌名',
            artist: '歌手 A, 歌手 B',
            level: 'exhigh',
            bitrate: 320,
            total: 240,
        });
        expect(params).not.toHaveProperty('sourceid');
    });

    it.each([
        ['standard', 'standard', 128],
        ['high', 'exhigh', 320],
        ['lossless', 'lossless', 999],
        ['hires', 'hires', 1999],
    ] as const)('maps %s quality to level %s', async (quality, level, bitrate) => {
        vi.mocked(neteaseApi.scrobbleV1).mockResolvedValue({ code: 200 } as any);

        await neteaseProvider.playbackReports!.reportPlayback(reported, { playedSeconds: 45, quality });

        expect(vi.mocked(neteaseApi.scrobbleV1).mock.calls[0][0]).toMatchObject({ level, bitrate });
    });

    it('rejects a report the account was not signed in for', async () => {
        vi.mocked(neteaseApi.scrobbleV1).mockResolvedValue({ code: 301 } as any);

        await expect(neteaseProvider.playbackReports!.reportPlayback(reported, { playedSeconds: 45 }))
            .rejects.toMatchObject({ code: 'auth-required' });
    });

    it('rejects a response that carries no status code at all', async () => {
        // A gateway error page, or an API build with no /scrobble/v1 route: valid JSON, no `code`.
        vi.mocked(neteaseApi.scrobbleV1).mockResolvedValue({ message: 'Not Found' } as any);

        await expect(neteaseProvider.playbackReports!.reportPlayback(reported, { playedSeconds: 45 }))
            .rejects.toMatchObject({ code: 'unavailable' });
    });

    it('rejects any other non-success code', async () => {
        vi.mocked(neteaseApi.scrobbleV1).mockResolvedValue({ code: 500 } as any);

        await expect(neteaseProvider.playbackReports!.reportPlayback(reported, { playedSeconds: 45 }))
            .rejects.toMatchObject({ code: 'unavailable' });
    });
});

import md5 from 'blueimp-md5';
import type { UnifiedSong } from '../../types';
import type { JsonValue, ProviderPage } from '../../types/onlineMusic';
import { lxHttp } from '../lxSource/http';

// src/services/onlineMusic/lxCatalog.ts
// Catalog protocol reference: lyswhut/lx-music-desktop musicSdk/{kw,mg}/musicSearch.js.
// This adapter only requests catalog metadata. Audio URLs always come from the user's LX script.
const text = (value: unknown) => String(value ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
function song(platform: string, id: string, name: unknown, artists: string[], albumId: unknown, albumName: unknown, duration: unknown, cover: unknown, data: Record<string, JsonValue>): UnifiedSong {
    return { id: `lx-${platform}:${id}`, name: text(name), artists: artists.filter(Boolean).map((name, index) => ({ id: index, name })),
        album: { id: text(albumId), name: text(albumName), ...(cover ? { coverUrl: text(cover) } : {}) }, durationMs: Math.max(0, Number(duration) || 0) * 1000,
        sourceRef: { kind:'online', providerId:`lx-${platform}`, mediaId:id, providerData:{ ...data, lxPlatform:platform } } };
}
export function normalizeKuwoCatalog(rows: unknown): UnifiedSong[] {
    if (!Array.isArray(rows)) return [];
    return rows.flatMap(item => {
        if (!item || typeof item !== 'object') return [];
        const id = text(item.MUSICRID).replace(/^MUSIC_/, '');
        if (!id || !text(item.SONGNAME)) return [];
        return [song('kw', id, item.SONGNAME, text(item.ARTIST).split(/&|;/), item.ALBUMID, item.ALBUM, item.DURATION, item.pic || item.img, { songMid:id, albumId:text(item.ALBUMID), formats:text(item.N_MINFO) })];
    });
}
export function normalizeMiguCatalog(rows: unknown): UnifiedSong[] {
    if (!Array.isArray(rows)) return [];
    const seen = new Set<string>();
    return rows.flat().flatMap(item => {
        const id = text(item?.copyrightId), songId = text(item?.songId);
        if (!id || !songId || !text(item.name) || seen.has(id)) return [];
        seen.add(id);
        let cover = item.img3 || item.img2 || item.img1;
        if (cover && !/^https?:\/\//.test(cover)) cover = 'https://d.musicapp.migu.cn' + cover;
        const artists = Array.isArray(item.singerList) ? item.singerList.map((s: {name?:string}) => text(s.name)) : [];
        return [song('mg', id, item.name, artists, item.albumId, item.album, item.duration, cover,
            { songId, songMid:songId, copyrightId:id, albumId:text(item.albumId), lrcUrl:text(item.lrcUrl || item.lyricUrl), mrcUrl:text(item.mrcurl), trcUrl:text(item.trcUrl) })];
    });
}
export async function searchLxCatalog(platform: 'kw'|'mg', query: string, limit: number, offset: number, signal?: AbortSignal): Promise<ProviderPage<UnifiedSong>> {
    const pageSize = Math.max(1, Math.min(50, Math.trunc(limit)));
    let url: string, headers: Record<string,string> = {};
    if (platform === 'kw') {
        const params = new URLSearchParams({ client:'kt', all:query, pn:String(Math.floor(offset/pageSize)), rn:String(pageSize), uid:'794762570', ver:'kwplayer_ar_9.2.2.1', vipver:'1', show_copyright_off:'1', newver:'1', ft:'music', cluster:'0', strategy:'2012', encoding:'utf8', rformat:'json', vermerge:'1', mobi:'1', issubtitle:'1' });
        url = 'https://search.kuwo.cn/r.s?' + params;
    } else {
        const timestamp = String(Date.now()), deviceId = '963B7AA0D21511ED807EE5846EC87D20';
        const sign = md5(`${query}6cdc72a439cef99a3418d2a78aa28c73yyapp2d16148780a1dcc7408e06336b98cfd50${deviceId}${timestamp}`);
        headers = { uiVersion:'A_music_3.6.1', deviceId, timestamp, sign, channel:'0146921', 'User-Agent':'Mozilla/5.0' };
        const params = new URLSearchParams({ isCorrect:'0', isCopyright:'1', searchSwitch:JSON.stringify({song:1,album:0,singer:0,tagSong:1,mvSong:0,bestShow:1,songlist:0,lyricSong:0}), pageSize:String(pageSize), text:query, pageNo:String(Math.floor(offset/pageSize)+1), sort:'0', sid:'USS' });
        url = 'https://jadeite.migu.cn/music_search/v3/search/searchAll?' + params;
    }
    const response = await lxHttp(url, { headers }, signal || new AbortController().signal);
    if (response.statusCode !== 200 || !response.body || typeof response.body !== 'object') throw Error('平台搜索暂时不可用');
    const body = response.body as Record<string, any>;
    if (platform === 'mg' && body.code !== '000000') throw Error(text(body.info) || '咪咕搜索暂时不可用');
    if (platform === 'kw' && !Array.isArray(body.abslist) && String(body.TOTAL) !== '0') throw Error('酷我搜索响应无有效列表');
    const items = platform === 'kw' ? normalizeKuwoCatalog(body.abslist) : normalizeMiguCatalog(body.songResultData?.resultList);
    const total = Math.max(0, Number(platform === 'kw' ? body.TOTAL : body.songResultData?.totalCount) || 0);
    // Page offsets follow the upstream page size even if malformed/duplicate rows were discarded.
    return { items, total, hasMore:offset+pageSize<total, nextOffset:offset+pageSize };
}

import { OnlineProviderError, type MediaId, type ProviderCollection } from '../../types/onlineMusic';
import { requestQq } from './qqTransport';
import { normalizeQqSong } from './qqNormalize';

// src/services/onlineMusic/qqCharts.ts
const PREFIX = 'new-chart:';
const fail = (message: string): never => { throw new OnlineProviderError('invalid-response', message, 'qq'); };

// The embedded bridge and the existing qq-music-api server wrap the same musicu response differently.
function unwrap(response: any): any {
    const body = response?.response ?? response;
    if (Number(body?.code) !== 0) return fail(`QQ chart business code: ${body?.code}`);
    const block = body.req_0 ?? body.req_1;
    if (block && Number(block.code) !== 0) return fail(`QQ chart detail code: ${block.code}`);
    return block ? block.data : body.data;
}
function chartsIn(value: any): any[] {
    if (!value || typeof value !== 'object') return [];
    return [...((value.topId != null || value.id != null) && (value.title || value.topTitle) ? [value] : []),
        ...Object.values(value).flatMap(chartsIn)];
}
export function parseQqChartId(id: MediaId) {
    const match = String(id).match(/^new-chart:(\d+):(.*)$/);
    return match ? { topId: Number(match[1]), period: decodeURIComponent(match[2]) } : null;
}
export async function getQqNewReleaseCollection(): Promise<ProviderCollection> {
    const charts = chartsIn(unwrap(await requestQq('toplist_list')));
    const chart = charts.find(item => /^(?:QQ音乐)?新歌榜$/.test(String(item.title || item.topTitle).trim()));
    const topId = Number(chart?.topId ?? chart?.id);
    if (!Number.isSafeInteger(topId) || topId <= 0) return fail('QQ new-song chart was not found in the current chart list');
    const period = String(chart.period || '');
    return { providerId: 'qq', type: 'playlist', id: `${PREFIX}${topId}:${encodeURIComponent(period)}`,
        name: String(chart.title || chart.topTitle), coverUrl: chart.frontPicUrl || chart.picUrl || chart.pic,
        trackCount: Number(chart.totalNum || chart.songNum) || undefined,
        description: String(chart.intro || ''), isOwned: false };
}
export async function getQqChartTracks(id: MediaId, limit: number, offset: number) {
    const chart = parseQqChartId(id);
    if (!chart) return fail('Invalid QQ chart identity');
    const data = unwrap(await requestQq('toplist_detail', { ...chart, limit, page: offset }));
    const info = data?.data;
    if (Number(info?.topId) !== chart.topId || !/新歌榜/.test(String(info?.title || '')))
        return fail('QQ returned a different chart');
    if (!Array.isArray(data.songInfoList)) return fail('QQ chart returned no track metadata');
    const byId = new Map(data.songInfoList.map((song: any) => [String(song.id), song]));
    const ranked: any[] = Array.isArray(info.song) && info.song.length
        ? info.song.map((item: any) => byId.get(String(item.songId))) : data.songInfoList;
    if (ranked.some((song: any) => !song?.mid || !song?.name || !song?.singer?.length))
        return fail('QQ chart has incomplete track metadata');
    const items = ranked.map(normalizeQqSong);
    const nextOffset = offset + items.length;
    const total = Number(info.totalNum || info.total || nextOffset);
    return { items, total, hasMore: items.length > 0 && nextOffset < total, nextOffset };
}

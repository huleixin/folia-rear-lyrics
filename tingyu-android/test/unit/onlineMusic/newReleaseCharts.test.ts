import { beforeEach, expect, it, vi } from 'vitest';

// test/unit/onlineMusic/newReleaseCharts.test.ts
const request = vi.hoisted(() => vi.fn());
const load = vi.hoisted(() => vi.fn());
vi.mock('@/services/onlineMusic/qqTransport', () => ({ requestQq: request }));
vi.mock('@/services/onlineMusic/omni', () => ({ omni: { getProviderNewReleaseCollection: load } }));
import { getQqNewReleaseCollection, getQqChartTracks } from '@/services/onlineMusic/qqCharts';
import { loadNewReleaseChart, NEW_RELEASE_FRESH_MS } from '@/services/onlineMusic/newReleaseCharts';
beforeEach(() => { request.mockReset(); load.mockReset(); });
const track = (id: number) => ({ id, mid: `mid-${id}`, name: `Track ${id}`, singer: [{ mid: 'artist-mid', name: 'Artist' }],
    album: { mid: 'album-mid', name: 'Album' }, interval: 200 });
it('discovers the current new-song chart instead of hard-coding its historical id', async () => {
    request.mockResolvedValue({ code: 0, data: { group: [{ toplist: [
        { topId: 27, title: '热歌榜' }, { topId: 901, title: '新歌榜', period: 'current-period' },
    ] }] } });
    const chart = await getQqNewReleaseCollection();
    expect(chart.id).toBe('new-chart:901:current-period');
    expect(chart.providerId).toBe('qq');
});
it('keeps ranking order, source identity, metadata and correct pagination', async () => {
    request.mockResolvedValue({ response: { code: 0, req_1: { code: 0, data: {
        data: { topId: 901, title: '新歌榜', totalNum: 3, song: [{ songId: 2 }, { songId: 1 }] },
        songInfoList: [track(1), track(2)],
    } } } });
    const page = await getQqChartTracks('new-chart:901:period', 2, 0);
    expect(page.items.map(song => song.name)).toEqual(['Track 2', 'Track 1']);
    expect(page.items.map(song => song.sourceRef?.kind === 'online' ? song.sourceRef.providerId : undefined)).toEqual(['qq', 'qq']);
    expect(page.items[0].album.coverUrl).toContain('album-mid');
    expect(page.hasMore).toBe(true);
    expect(request).toHaveBeenCalledWith('toplist_detail', { topId: 901, period: 'period', limit: 2, page: 0 });
});
it('does not treat HTTP 200, empty/mismatched charts or missing track metadata as success', async () => {
    for (const response of [{ code: 500 }, { code: 0, data: { group: [] } }]) {
        request.mockResolvedValue(response);
        await expect(getQqNewReleaseCollection()).rejects.toThrow();
    }
    request.mockResolvedValue({ code: 0, data: { data: { topId: 901, title: '热歌榜' }, songInfoList: [track(1)] } });
    await expect(getQqChartTracks('new-chart:901:period', 2, 0)).rejects.toThrow('different chart');
    request.mockResolvedValue({ code: 0, data: { data: { topId: 901, title: '新歌榜', song: [{ songId: 2 }] }, songInfoList: [track(1)] } });
    await expect(getQqChartTracks('new-chart:901:period', 2, 0)).rejects.toThrow('incomplete');
});
it('isolates providers, deduplicates requests and expires cached metadata', async () => {
    const date = vi.spyOn(Date, 'now').mockReturnValue(1000);
    try {
        load.mockImplementation(async providerId => ({ providerId, id: 'chart', name: '新歌榜', type: 'playlist' }));
        await Promise.all([loadNewReleaseChart('test-qq'), loadNewReleaseChart('test-qq')]);
        expect(load).toHaveBeenCalledTimes(1);
        await loadNewReleaseChart('test-ne');
        expect(load).toHaveBeenCalledTimes(2);
        date.mockReturnValue(NEW_RELEASE_FRESH_MS + 1002);
        await loadNewReleaseChart('test-qq');
        expect(load).toHaveBeenCalledTimes(3);
        load.mockResolvedValue({ providerId: 'wrong', id: 'chart', name: '新歌榜' });
        await expect(loadNewReleaseChart('mismatch')).rejects.toThrow('identity');
    } finally { date.mockRestore(); }
});

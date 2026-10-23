import { expect, it, vi } from 'vitest';

// test/unit/onlineMusic/newReleaseNetease.test.ts
const toplists = vi.hoisted(() => vi.fn());
vi.mock('@/services/netease', () => ({ neteaseApi: { getToplists: toplists } }));
import { neteaseProvider } from '@/services/onlineMusic/neteaseProvider';
it('discovers the real new-song collection identity from a valid provider response', async () => {
    toplists.mockResolvedValue({ code: 200, list: [{id: 999, name:'热歌榜'}, {id: 777, name:'云音乐新歌榜', coverImgUrl:'https://cover.test/new.jpg', trackCount:100}] });
    const collection = await neteaseProvider.catalog!.getNewReleaseCollection!();
    expect(collection).toMatchObject({id:777, name:'云音乐新歌榜', providerId:'netease', type:'playlist'});
});
it('rejects network failures, missing data and business errors without substituting another chart', async () => {
    for (const response of [{code:500}, {code:200,list:[]}, {code:200,list:[{id:27,name:'热歌榜'}]}]) {
        toplists.mockResolvedValue(response);
        await expect(neteaseProvider.catalog!.getNewReleaseCollection!()).rejects.toThrow();
    }
    toplists.mockRejectedValue(new Error('network timeout'));
    await expect(neteaseProvider.catalog!.getNewReleaseCollection!()).rejects.toThrow('timeout');
});

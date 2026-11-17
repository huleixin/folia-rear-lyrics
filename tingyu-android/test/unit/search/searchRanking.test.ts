import { expect, it, vi } from 'vitest';
import type { UnifiedSong } from '@/types';
import { appendRankedSearch, bestSearchMatch, rankSearchBatch, searchRelevance } from '@/services/search/searchRanking';

// test/unit/search/searchRanking.test.ts
vi.mock('@/services/onlineMusic/songAvailability',()=>({isSongUnavailable:(song:any)=>song.unavailable===true}));
const song=(id:number,name:string,source='qq',extra:any={}):UnifiedSong=>({id,name,artists:[{id:1,name:'Singer'}],album:{id:1,name:'Album'},durationMs:200000,
    sourceRef:{kind:'online',providerId:source,mediaId:String(id)},...extra} as UnifiedSong);
it('normalizes case/width and prioritizes exact matching over a configured platform',()=>{
    const exact=song(1,'ＳＯＮＧ','netease'), preferred=song(2,'Song live','qq');
    expect(searchRelevance(' song ','ＳＯＮＧ')).toBe(1000);
    expect(rankSearchBatch([preferred,exact],'Song','provider','qq')).toEqual([exact,preferred]);
});
it('keeps established rows stable while sorting each new batch and excluding duplicate identities',()=>{
    const initial=song(1,'Song live'),a=song(2,'Song'),b=song(3,'Song remix');
    expect(appendRankedSearch([initial],[b,a,initial],'Song','relevance','')).toEqual([initial,a,b]);
});
it('keeps provider order for equal scores and does not mutate the input',()=>{
    const songs=[song(3,'Song'),song(1,'Song')];
    expect(rankSearchBatch(songs,'Song','relevance','')).toEqual(songs);
});
it('does not invent a best match for empty or low confidence queries',()=>{
    expect(bestSearchMatch('',[song(1,'Song')],[],[],[])).toBeNull();
    expect(bestSearchMatch('Song',[song(1,'Song live')],[],[],[])).toBeNull();
});
it('chooses an exact available song and supports exact artist, album and playlist fallbacks',()=>{
    const blocked=song(1,'Song','qq',{unavailable:true}),available=song(2,'Song','netease');
    expect(bestSearchMatch('Song',[blocked,available],[],[],[])).toEqual({kind:'song',song:available});
    const artist={providerId:'qq',id:1,name:'Song'},album={providerId:'qq',id:2,name:'Song'},playlist={providerId:'netease',id:3,name:'Song'};
    expect(bestSearchMatch('Song',[blocked],[artist],[],[])).toEqual({kind:'artist',hit:artist});
    expect(bestSearchMatch('Song',[],[],[album],[])).toEqual({kind:'album',hit:album});
    expect(bestSearchMatch('Song',[],[],[],[playlist])).toEqual({kind:'playlist',hit:playlist});
});

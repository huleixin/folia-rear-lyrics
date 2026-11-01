import {expect,it,vi} from 'vitest';
import {resolveAccurateLyrics} from '@/services/resolveAccurateLyrics';
// test/unit/services/resolveAccurateLyrics.test.ts
const mocks=vi.hoisted(()=>({match:vi.fn(),save:vi.fn(),state:vi.fn()}));
vi.mock('@/utils/lyrics/autoMatchBestLyric',()=>({autoMatchBestLyric:mocks.match}));
vi.mock('@/stores/useLyricSettingsStore',()=>({useLyricSettingsStore:{getState:()=>({autoUseBestLyric:true,preferredAlternativeLyricSource:'netease'})}}));
vi.mock('@/utils/onlineLyricsState',()=>({loadOnlineLyricsState:mocks.state,resolveOnlineLyrics:(_:unknown,data:unknown)=>data}));
vi.mock('@/services/sharedSongResources',()=>({cacheSharedLyrics:mocks.save,readSharedLyricRecord:async()=>null}));
it('uses the stage matcher before confirming shared lyrics and keeps failed matches provisional',async()=>{
 const song={id:1,name:'Song',artists:[{id:1,name:'Singer'}],album:{id:1,name:'Album'},durationMs:200000,sourceRef:{kind:'online',providerId:'qq',mediaId:'1'}} as const;
 const base={lines:[{startTime:1,endTime:3,fullText:'line',words:[]}],isWordByWord:false},best={...base,isWordByWord:true};
 mocks.state.mockResolvedValue(null);mocks.match.mockResolvedValue({lyrics:best,id:2,source:'netease'});
 const value=await resolveAccurateLyrics(song as any,{lyrics:base,isPureMusic:false});expect(value?.resourceCacheTier).toBe('stage');
 expect(mocks.save).toHaveBeenLastCalledWith(song,expect.objectContaining({resourceCacheTier:'stage'}),'confirmed-match');
 mocks.match.mockRejectedValueOnce(Error('network'));expect((await resolveAccurateLyrics(song as any,{lyrics:base,isPureMusic:false}))?.resourceCacheTier).toBe('platform');
});

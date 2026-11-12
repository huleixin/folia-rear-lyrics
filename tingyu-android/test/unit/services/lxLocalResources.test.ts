// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {resolveLxLocalResources} from '@/services/lxSource/localResources';
import {useLxSourceStore} from '@/stores/useLxSourceStore';
import type {SongResult} from '@/types';

// test/unit/services/lxLocalResources.test.ts
const fixture=vi.hoisted(()=>({request:vi.fn(),parse:vi.fn(),session:vi.fn()}));
vi.mock('@/services/lxSource/session',()=>({withLxRuntime:(work:any)=>{fixture.session();return work({ready:Promise.resolve({local:{name:'local',qualitys:[],actions:['lyric','pic']}}),request:fixture.request},useLxSourceStore.getState(),()=>{});}}));
vi.mock('@/utils/lyrics/workerClient',()=>({parseLyricsAsync:fixture.parse}));
const old=useLxSourceStore.getState(),song={id:'local-fixture',name:'Title',artists:[{id:1,name:'Artist'}],album:{id:1,name:'Album'},durationMs:10000,sourceRef:{kind:'local',mediaId:'local-fixture'},filePath:'private-path'} as unknown as SongResult;
beforeEach(()=>{vi.clearAllMocks();useLxSourceStore.setState({scripts:[{id:'l',name:'l',code:'',version:'1',author:'',description:'',homepage:'',capabilities:{local:{name:'local',qualitys:[],actions:['lyric','pic']}}}],activeId:'l'});});
afterEach(()=>useLxSourceStore.setState(old));
it('passes translation, romanization and word timing through the existing parser without exposing local file paths',async()=>{
    fixture.request.mockResolvedValueOnce({lyric:'main',lxlyric:'word',tlyric:'translation',rlyric:'roman'}).mockResolvedValueOnce('https://image.example/cover.jpg');fixture.parse.mockResolvedValue({lines:[]});
    const result=await resolveLxLocalResources(song,{lyric:true,pic:true});expect(result.coverUrl).toBe('https://image.example/cover.jpg');
    expect(fixture.parse).toHaveBeenCalledWith('awlrc','word','translation',undefined,'roman');expect(JSON.stringify(fixture.request.mock.calls)).not.toContain('private-path');
    expect(fixture.request.mock.calls.map(([value])=>value.action)).toEqual(['lyric','pic']);
});
it('does not invoke undeclared ordinary-source resource operations',async()=>{
    useLxSourceStore.setState({scripts:[{...useLxSourceStore.getState().scripts[0],capabilities:{tx:{name:'QQ',qualitys:['128k']}}}]});
    expect(await resolveLxLocalResources(song,{lyric:true,pic:true})).toEqual({lyrics:null,coverUrl:null});expect(fixture.session).not.toHaveBeenCalled();
});
it('keeps the existing local resources when no fallback is requested',async()=>{
    await resolveLxLocalResources(song,{lyric:false,pic:false});expect(fixture.request).not.toHaveBeenCalled();
});
it('contains script errors and still allows an independent cover fallback',async()=>{
    fixture.request.mockRejectedValueOnce(Error('lyric failed')).mockResolvedValueOnce('https://image.example/cover.jpg');
    expect(await resolveLxLocalResources(song,{lyric:true,pic:true})).toEqual({lyrics:null,coverUrl:'https://image.example/cover.jpg'});
});

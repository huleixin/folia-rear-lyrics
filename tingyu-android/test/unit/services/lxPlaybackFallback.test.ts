// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { resolveLxSource } from '@/services/lxSource/playback';
import { useLxSourceStore } from '@/stores/useLxSourceStore';
import type { SongResult } from '@/types';

// test/unit/services/lxPlaybackFallback.test.ts
const mock=vi.hoisted(()=>({request:vi.fn(),match:vi.fn(),prepare:vi.fn(async(url:string)=>url),stop:vi.fn()}));
vi.mock('@/services/lxSource/client',()=>({LxRuntime:class{ready=Promise.resolve({tx:{name:'QQ',qualitys:['128k']},kw:{name:'酷我',qualitys:['128k']}});request=mock.request;stop=mock.stop}}));
vi.mock('@/services/lxSource/catalogMatch',()=>({matchLxCatalogSong:mock.match}));
vi.mock('@/services/lxSource/media',()=>({prepareLxAudio:mock.prepare}));
const saved=useLxSourceStore.getState();
afterEach(()=>{useLxSourceStore.setState(saved);vi.clearAllTimers();vi.useRealTimers();vi.clearAllMocks()});
it('uses one matching platform from the same script after QQ fails without mutating the playlist',async()=>{
    vi.useFakeTimers();const original={id:'qq-original',name:'Song',artists:[{id:1,name:'Singer'}],album:{id:1,name:'Album'},durationMs:236000,
        sourceRef:{kind:'online',providerId:'qq',mediaId:'qq-mid',providerData:{songId:123}}} as SongResult;
    const alternate={...original,sourceRef:{kind:'online',providerId:'lx-kw',mediaId:'456593448'}} as SongResult;
    mock.match.mockResolvedValueOnce(original).mockResolvedValueOnce(alternate);
    mock.request.mockRejectedValueOnce(Error('QQ音乐暂时无法获取')).mockResolvedValueOnce('https://audio.example/song.mp3');
    useLxSourceStore.setState({revision:70,scripts:[{id:'test',name:'test',code:'',version:'1',description:'',author:'',homepage:'',capabilities:{}}],activeId:'test'});
    const before=structuredClone(original),result=await resolveLxSource(original,'standard');
    expect(result?.url).toBe('https://audio.example/song.mp3');
    expect(mock.request.mock.calls.map(([request])=>[request.source,request.info.musicInfo.songmid])).toEqual([['tx','qq-mid'],['kw','456593448']]);
    expect(mock.match.mock.calls[1][2]).toEqual(new Set(['tx']));expect(original).toEqual(before);
});
it('does not try another platform or return an old result after a source change',async()=>{
    vi.useFakeTimers();const song={id:1,name:'Song',artists:[],album:{id:1,name:''},durationMs:236000,sourceRef:{kind:'online',providerId:'qq',mediaId:'1'}} as SongResult;
    mock.match.mockResolvedValue(song);mock.request.mockImplementationOnce(async()=>{useLxSourceStore.setState({revision:72});throw Error('old source failed')});
    useLxSourceStore.setState({revision:71,scripts:[{id:'test',name:'test',code:'',version:'1',description:'',author:'',homepage:'',capabilities:{}}],activeId:'test'});
    await expect(resolveLxSource(song,'standard')).rejects.toThrow('音源已更换');expect(mock.request).toHaveBeenCalledTimes(1);
});
it('does not retire a worker while another playback or prefetch call is still resolving',async()=>{
    vi.useFakeTimers();const song={id:1,name:'Song',artists:[],album:{id:1,name:''},durationMs:236000,sourceRef:{kind:'online',providerId:'qq',mediaId:'1'}} as SongResult;
    let finish!:(url:string)=>void;
    mock.match.mockResolvedValue(song);mock.request.mockImplementationOnce(()=>new Promise<string>(resolve=>{finish=resolve})).mockResolvedValueOnce('https://audio.example/next.mp3');
    useLxSourceStore.setState({revision:73,scripts:[{id:'test',name:'test',code:'',version:'1',description:'',author:'',homepage:'',capabilities:{}}],activeId:'test'});
    const current=resolveLxSource(song,'standard');await vi.waitFor(()=>expect(mock.request).toHaveBeenCalledOnce());
    await resolveLxSource(song,'standard');mock.stop.mockClear();
    await vi.advanceTimersByTimeAsync(31000);expect(mock.stop).not.toHaveBeenCalled();
    finish('https://audio.example/current.mp3');await current;
    await vi.advanceTimersByTimeAsync(31000);expect(mock.stop).toHaveBeenCalledOnce();
});

// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {resolveLxSource} from '@/services/lxSource/playback';
import {useLxSourceStore,DEFAULT_LX_POLICY} from '@/stores/useLxSourceStore';
import type {SongResult} from '@/types';

// test/unit/services/lxPlaybackPolicy.test.ts
const fixture=vi.hoisted(()=>({request:vi.fn(),match:vi.fn(),stop:vi.fn()}));
vi.mock('@/services/lxSource/client',()=>({LxRuntime:class{isClosed=false;ready=Promise.resolve({tx:{name:'QQ',qualitys:['128k','320k','flac','flac24bit']},kw:{name:'Kuwo',qualitys:['128k']}});request=fixture.request;stop=fixture.stop;}}));
vi.mock('@/services/lxSource/catalogMatch',()=>({matchLxCatalogSong:fixture.match}));
vi.mock('@/services/lxSource/media',()=>({prepareLxAudio:async(url:string)=>url}));
const old=useLxSourceStore.getState();
const song={id:'qq-original',name:'Fixture',artists:[{id:1,name:'Artist'}],album:{id:1,name:'Album'},durationMs:120000,sourceRef:{kind:'online',providerId:'qq',mediaId:'qq-mid'}} as SongResult;
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();useLxSourceStore.setState({scripts:[{id:'p',name:'p',code:'',version:'1',description:'',author:'',homepage:'',capabilities:{}}],activeId:'p',revision:useLxSourceStore.getState().revision+1,policy:{...DEFAULT_LX_POLICY,autoSwitch:false}});fixture.match.mockResolvedValue(song);});
afterEach(()=>{useLxSourceStore.setState(old);vi.clearAllTimers();vi.useRealTimers();});
it('tries lower declared qualities after FLAC failures and reports negotiated quality as unverified',async()=>{
    fixture.request.mockImplementation(async data=>{if(data.info.type.startsWith('flac'))throw Error('fixture codec failure');return 'https://audio.example/fixture.mp3';});
    const result=await resolveLxSource(song,'hires');expect(fixture.request.mock.calls.map(([d])=>d.info.type)).toEqual(['flac24bit','flac','320k']);
    expect(result).toMatchObject({quality:'high',qualityVerified:false});
});
it('does not downgrade when disabled',async()=>{
    useLxSourceStore.setState({policy:{...DEFAULT_LX_POLICY,autoSwitch:false,autoDowngrade:false}});fixture.request.mockRejectedValue(Error('fixture flac failure'));
    await expect(resolveLxSource(song,'lossless')).rejects.toThrow('fixture flac failure');expect(fixture.request).toHaveBeenCalledTimes(1);
});
it('bounds same-source retries to the configured count',async()=>{
    useLxSourceStore.setState({policy:{...DEFAULT_LX_POLICY,autoSwitch:false,retries:1}});fixture.request.mockRejectedValueOnce(Error('temporary')).mockResolvedValueOnce('https://audio.example/fixture.mp3');
    await resolveLxSource(song,'standard');expect(fixture.request).toHaveBeenCalledTimes(2);
});
it('passes the chosen alternative platform to matching and uses its own ID',async()=>{
    const other={...song,sourceRef:{kind:'online',providerId:'lx-kw',mediaId:'kw-own-id'}} as SongResult;
    useLxSourceStore.setState({policy:{...DEFAULT_LX_POLICY,preferredSource:'kw',autoSwitch:false}});fixture.match.mockResolvedValue(other);fixture.request.mockResolvedValue('https://audio.example/fixture.mp3');
    await resolveLxSource(song,'standard');expect(fixture.request.mock.calls[0][0]).toMatchObject({source:'kw',info:{musicInfo:{songmid:'kw-own-id'}}});
    expect(fixture.match.mock.calls[0][4]).toBe('kw');expect(song.sourceRef?.mediaId).toBe('qq-mid');
});
it('never publishes a result from a replaced script',async()=>{
    fixture.request.mockImplementation(async()=>{useLxSourceStore.setState({revision:useLxSourceStore.getState().revision+1});return 'https://audio.example/stale.mp3';});
    await expect(resolveLxSource(song,'standard')).rejects.toThrow('音源已更换');
});

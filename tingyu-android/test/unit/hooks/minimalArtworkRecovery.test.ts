// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useMinimalArtwork} from '@/components/app/overlays/minimal-stage/useMinimalArtwork';
import type {SongResult} from '@/types';

// test/unit/hooks/minimalArtworkRecovery.test.ts
const cache=vi.hoisted(()=>vi.fn());
vi.mock('@/services/onlineMusic/resourceCache',()=>({getCachedSongCoverUrl:cache}));
vi.mock('@/services/onlineMusic/songMetadata',()=>({getSongCoverUrl:(song:any)=>song.coverUrl}));
vi.mock('@/utils/appPlaybackGuards',()=>({getPlaybackSongKey:(song:any)=>String(song.id)}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
class FakeImage {
    src=''; decoding=''; complete=false; naturalWidth=0;
    onload:((e:Event)=>void)|null=null; onerror:((e:Event)=>void)|null=null;
    decode=()=>Promise.resolve();
    constructor(){images.push(this);}
}
let images:FakeImage[]=[];
let root:Root; let state:ReturnType<typeof useMinimalArtwork>;
const song=(id:string,coverUrl='')=>({id,coverUrl} as unknown as SongResult);
const Harness=({url,track}:{url:string|null;track:SongResult})=>{state=useMinimalArtwork(url,track);return null;};
const render=(url:string|null,track:SongResult)=>act(()=>root.render(React.createElement(Harness,{url,track})));
const settle=()=>act(async()=>{for(let i=0;i<12;i++)await Promise.resolve();});
const fail=async(index:number)=>{act(()=>images[index].onerror?.(new Event('error')));await settle();};
const success=async(index:number)=>{act(()=>{images[index].naturalWidth=200;images[index].onload?.(new Event('load'));});await settle();};
beforeEach(()=>{images=[];cache.mockReset();cache.mockResolvedValue(null);vi.stubGlobal('Image',FakeImage);root=createRoot(document.createElement('div'));vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});});
afterEach(()=>{act(()=>root.unmount());vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
it('recovers a failed primary URL from the same song cache',async()=>{
    cache.mockResolvedValue('blob:recovered');render('broken',song('one'));await fail(0);
    await vi.waitFor(()=>expect(images.at(-1)?.src).toBe('blob:recovered'));
    await success(images.length-1);expect(state.source).toBe('blob:recovered');expect(cache.mock.calls[0][0].id).toBe('one');
});
it('uses original metadata if cache is absent and caps failures',async()=>{
    render('bad-primary',song('two','original'));await fail(0);
    await vi.waitFor(()=>expect(images.at(-1)?.src).toBe('original'));
    await fail(images.length-1);expect(images.at(-1)?.src).toBe('bad-primary');
    await fail(images.length-1);expect(state.failed).toBe(true);expect(state.source).toBeNull();expect(images.length).toBe(3);
});
it('never paints an old song when a delayed image succeeds',async()=>{
    render('song-a',song('A'));const late=images[0].onload;
    await success(0);expect(state.source).toBe('song-a');
    render('song-b',song('B'));expect(state.source).toBeNull();
    act(()=>late?.(new Event('load')));await settle();expect(state.source).toBeNull();
    await success(1);expect(state.source).toBe('song-b');
});
it('ignores and revokes cache data that arrives after a song switch',async()=>{
    let done!:(value:string)=>void;cache.mockReturnValue(new Promise(resolve=>done=resolve));
    render('expired-a',song('old'));await fail(0);await vi.waitFor(()=>expect(cache).toHaveBeenCalled());
    render('fresh-b',song('new'));done('blob:late');await settle();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late');expect(state.source).toBeNull();
});
it('times out stalled images rather than waiting forever',async()=>{
    vi.useFakeTimers();render('stalled',song('timeout'));await act(async()=>{await vi.advanceTimersByTimeAsync(12000);});
    expect(state.failed).toBe(true);expect(images.length).toBeLessThanOrEqual(4);
});

it('survives StrictMode setup-cleanup without committing the cancelled loader',async()=>{
    act(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Harness,{url:'strict-image',track:song('strict')}))));
    expect(images.length).toBe(2);expect(images[0].onload).toBeNull();
    await success(1);expect(state.source).toBe('strict-image');
});
it('starts a known remote image immediately while its cached URL is temporarily absent',async()=>{
    cache.mockReturnValue(new Promise(()=>{}));render(null,song('remote-first','remote-cover'));
    expect(images[0].src).toBe('remote-cover');expect(cache).not.toHaveBeenCalled();
    await success(0);expect(state.source).toBe('remote-cover');
});
it('never inherits a previous song failure flag',async()=>{
    render('bad',song('old'));await fail(0);await vi.waitFor(()=>expect(images.length).toBe(2));await fail(1);expect(state.failed).toBe(true);
    render('new',song('new'));expect(state.failed).toBe(false);expect(state.source).toBeNull();await success(2);expect(state.source).toBe('new');
});
it('returns the exact image object that finished decoding for DOM reuse',async()=>{
    render('reuse-node',song('reuse'));await success(0);expect(state.image).toBe(images[0]);
});

// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AUDIO_CACHE_CHUNK_BYTES, prepareNativeAudioSource } from '@/services/nativeAudioCache';

// test/unit/services/nativeAudioCache.test.ts
const port=vi.hoisted(()=>({audioCacheBegin:vi.fn(),audioCacheAppend:vi.fn(),audioCacheFinish:vi.fn(),audioCacheRelease:vi.fn()}));
vi.mock('@/platform/tingyuPlayback',()=>({getTingyuPlayback:()=>port}));
vi.mock('@/services/playbackTestLog',()=>({notePlaybackTest:vi.fn()}));
beforeEach(()=>{
    vi.clearAllMocks();port.audioCacheBegin.mockResolvedValue({token:'lease'});port.audioCacheFinish.mockResolvedValue({uri:'file:///private/lease.audio'});
    port.audioCacheAppend.mockResolvedValue(undefined);port.audioCacheRelease.mockResolvedValue(undefined);
});
afterEach(()=>vi.unstubAllGlobals());
it('stages offline Blob bytes in ordered bounded chunks and never reads the entire Blob arrayBuffer',async()=>{
    const bytes=Uint8Array.from({length:AUDIO_CACHE_CHUNK_BYTES*3+333},(_,i)=>i%251),blob=new Blob([bytes],{type:'audio/flac'});
    const whole=vi.spyOn(blob,'arrayBuffer');
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,blob:async()=>blob})));
    const result=await prepareNativeAudioSource('blob:offline',()=>true);
    expect(result.uri).toBe('file:///private/lease.audio');expect(whole).not.toHaveBeenCalled();
    const chunks=port.audioCacheAppend.mock.calls.map(([c])=>c);
    expect(chunks.map(c=>c.offset)).toEqual([0,65536,131072,196608]);
    const landed=Buffer.concat(chunks.map(c=>Buffer.from(c.data,'base64')));
    expect(landed).toEqual(Buffer.from(bytes));expect(chunks.every(c=>Buffer.from(c.data,'base64').length<=65536)).toBe(true);
    await result.release();await result.release();expect(port.audioCacheRelease).toHaveBeenCalledTimes(1);
});
it('cancels a replaced song between chunks and releases the partial file',async()=>{
    let live=true;vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,blob:async()=>new Blob([new Uint8Array(200000)])})));
    port.audioCacheAppend.mockImplementation(async()=>{live=false;});
    await expect(prepareNativeAudioSource('blob:old',()=>live)).rejects.toMatchObject({name:'AbortError'});
    expect(port.audioCacheAppend).toHaveBeenCalledTimes(1);expect(port.audioCacheFinish).not.toHaveBeenCalled();expect(port.audioCacheRelease).toHaveBeenCalledOnce();
});
it.each([new Blob(['partial']),new Blob([new Uint8Array(18000)],{type:'application/json'})])('rejects empty/truncated/error content before native allocation',async(blob)=>{
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,blob:async()=>blob})));
    await expect(prepareNativeAudioSource('blob:bad',()=>true)).rejects.toThrow('invalid');expect(port.audioCacheBegin).not.toHaveBeenCalled();
});
it('releases on append or commit failure without downloading another URL',async()=>{
    const fetcher=vi.fn(async()=>({ok:true,blob:async()=>new Blob([new Uint8Array(18000)])}));vi.stubGlobal('fetch',fetcher);
    port.audioCacheFinish.mockRejectedValueOnce(Error('incomplete'));
    await expect(prepareNativeAudioSource('blob:bad',()=>true)).rejects.toThrow('incomplete');expect(port.audioCacheRelease).toHaveBeenCalledOnce();expect(fetcher).toHaveBeenCalledTimes(1);
});
it('never routes remote, content or file sources through staging',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    for(const source of ['https://cdn/audio','content://media/1','file:///private/a'])expect((await prepareNativeAudioSource(source,()=>true)).uri).toBe(source);
    expect(fetcher).not.toHaveBeenCalled();expect(port.audioCacheBegin).not.toHaveBeenCalled();
});

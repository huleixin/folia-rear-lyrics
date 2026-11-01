// @vitest-environment jsdom
import { Blob as FileBlob } from 'node:buffer';
import { afterEach, expect, it, vi } from 'vitest';
import { attachNativeAudioElement } from '@/services/nativeAudioElement';

// test/unit/services/nativeCachedAudioElement.test.ts
const cache=vi.hoisted(()=>({audioCacheBegin:vi.fn(async()=>({token:'owned'})),audioCacheAppend:vi.fn(async()=>{}),audioCacheFinish:vi.fn(async()=>({uri:'file:///private/owned.audio'})),audioCacheRelease:vi.fn(async()=>{})}));
vi.mock('@/platform/tingyuPlayback',()=>({getTingyuPlayback:()=>cache}));
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('prepares Media3 from offline bytes while keeping the original Blob source for compatible fallback, then releases after detach',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,blob:async()=>new FileBlob([new Uint8Array(150000)],{type:'audio/mpeg'})})));
    const element=document.createElement('audio'),commands:any[]=[];
    const adapter=attachNativeAudioElement(element,{probe:async()=>({supported:true,engine:'media3'}),command:async command=>{commands.push(command);return{accepted:true};},addListener:async()=>({remove:async()=>{}})});
    try{
        adapter.setSource('blob:offline','online:qq:1',{playbackAttempt:'private-attempt'});
        for(let i=0;i<100;i++)await Promise.resolve();
        expect(commands.find(c=>c.action==='prepare')).toMatchObject({uri:'file:///private/owned.audio',songKey:'online:qq:1'});
        expect(commands.find(c=>c.action==='prepare')).not.toHaveProperty('playbackAttempt');
        expect(element.currentSrc).toBe('blob:offline');expect(cache.audioCacheRelease).not.toHaveBeenCalled();
        await adapter.dispose();expect(commands.at(-1).action).toBe('detach');expect(cache.audioCacheRelease).toHaveBeenCalledExactlyOnceWith({token:'owned'});
    }finally{await adapter.dispose();}
});

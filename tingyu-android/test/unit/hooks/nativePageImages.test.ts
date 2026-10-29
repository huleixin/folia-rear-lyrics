// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useNativePageImages, isWebManagedArtwork } from '@/hooks/useNativePageImages';

// test/unit/hooks/nativePageImages.test.ts
const cache=vi.hoisted(()=>({ready:new Map<string,string>(),resolve:{} as Record<string,(value:string)=>void>}));
vi.mock('@/services/nativePages',()=>({NATIVE_FIRST:true}));
vi.mock('@/services/nativeCoverThumbnail',()=>({peekNativeCoverThumbnail:(url:string)=>cache.ready.get(url),nativeCoverThumbnail:(url:string)=>
    new Promise<string>(resolve=>{cache.resolve[url]=(value:string)=>{cache.ready.set(url,value);resolve(value)}})}));
it('translates WebView-only local-cover resources instead of handing their non-network route to Coil',()=>{
    expect(isWebManagedArtwork(new URL('/__folia_cover/sha256?size=512',location.href).href)).toBe(true);
    expect(isWebManagedArtwork('/__folia_cover/sha256')).toBe(true);
    expect(isWebManagedArtwork('https://y.gtimg.cn/cover.jpg')).toBe(false);
    expect(isWebManagedArtwork('https://other.test/__folia_cover/x')).toBe(false);
});
it('publishes a fast cover while another is pending, and reuses it immediately when a page remounts',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();
    let model:any;const root=createRoot(document.createElement('div'));
    const input={key:'playlist',title:'List',sections:[{id:'songs',layout:'rows' as const,items:[{id:'a',title:'A',image:'blob:fast'},{id:'b',title:'B',image:'blob:slow'}]}]};
    function Probe(){model=useNativePageImages(input,true);return null}
    try{
        await act(()=>root.render(h(Probe)));expect(model.sections[0].items[0].image).toBe('');
        await act(async()=>{cache.resolve['blob:fast']('data:image/jpeg;base64,fast');await vi.advanceTimersByTimeAsync(49)});
        expect(model.sections[0].items[0].image).toBe('data:image/jpeg;base64,fast');expect(model.sections[0].items[1].image).toBe('');
        await act(()=>root.render(null));await act(()=>root.render(h(Probe)));
        expect(model.sections[0].items[0].image).toBe('data:image/jpeg;base64,fast');
    }finally{await act(()=>root.unmount());vi.useRealTimers()}
});

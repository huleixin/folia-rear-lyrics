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
it('resolves semantic settings thumbnails including nested dialogs through the shared image adapter',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();
    let model:any;const root=createRoot(document.createElement('div'));
    const input={key:'settings:document:qa',title:'设置',sections:[],document:{paints:[],controls:[],areas:[],live:[],flow:{key:'qa',title:'设置',nodes:[{id:'i',kind:'image' as const,title:'背景缩略图',value:'blob:settings-main'}],modal:{key:'dialog',title:'预览',nodes:[{id:'m',kind:'image' as const,title:'导入图片',value:'blob:settings-modal'}]}}}};
    function Probe(){model=useNativePageImages(input,true);return null}
    try{
        await act(()=>root.render(h(Probe)));expect(model.document.flow.nodes[0].value).toBe('');
        await act(async()=>{cache.resolve['blob:settings-main']('data:image/jpeg;base64,main');cache.resolve['blob:settings-modal']('data:image/jpeg;base64,modal');await vi.advanceTimersByTimeAsync(49)});
        expect(model.document.flow.nodes[0].value).toBe('data:image/jpeg;base64,main');
        expect(model.document.flow.modal.nodes[0].value).toBe('data:image/jpeg;base64,modal');
    }finally{await act(()=>root.unmount());vi.useRealTimers()}
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
it('封面批次失败后，就绪事件只对失败项补一轮并自动更新（成功项绝不重解）',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();
    let model:any;const root=createRoot(document.createElement('div'));
    const input={key:'home',title:'推荐',sections:[{id:'recent',layout:'cards' as const,items:[{id:'a',title:'A',image:'blob:good'},{id:'b',title:'B',image:'blob:bad'}]}]};
    function Probe(){model=useNativePageImages(input,true);return null}
    try{
        await act(()=>root.render(h(Probe)));
        await act(async()=>{cache.resolve['blob:good']('data:image/jpeg;base64,good');await vi.advanceTimersByTimeAsync(49)});
        // blob:bad 解析失败（空串）：记录失败、发布时不出空串。
        await act(async()=>{cache.resolve['blob:bad']('');await vi.advanceTimersByTimeAsync(49)});
        expect(model.sections[0].items[0].image).toBe('data:image/jpeg;base64,good');
        expect(model.sections[0].items[1].image).toBe('');
        // 事件驱动重试（SW 认领页面 / 封面资产落库）：只补失败项。
        await act(async()=>{window.dispatchEvent(new Event('folia-local-music-updated'));await vi.advanceTimersByTimeAsync(49)});
        expect(model.sections[0].items[1].image).toBe('');       // 重试这轮尚未就绪 → 保持占位
        cache.resolve['blob:bad']('data:image/jpeg;base64,bad'); // 重试 promise 由同一 resolver 解决
        await act(async()=>{await vi.advanceTimersByTimeAsync(49)});
        expect(model.sections[0].items[0].image).toBe('data:image/jpeg;base64,good');  // 成功项不受影响
        expect(model.sections[0].items[1].image).toBe('data:image/jpeg;base64,bad');   // 失败项自动恢复
        // 没有周期性轮询：事件不再来就不会有新请求。
        const pending=Object.keys(cache.resolve).length;
        await act(async()=>{await vi.advanceTimersByTimeAsync(5000)});
        expect(Object.keys(cache.resolve).length).toBe(pending);
    }finally{await act(()=>root.unmount());vi.useRealTimers()}
});

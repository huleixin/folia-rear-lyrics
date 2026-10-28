// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useNativeStagePresentation } from '@/hooks/useNativeStagePresentation';

// test/unit/hooks/nativeStagePresentation.test.ts
const suspend=vi.hoisted(()=>vi.fn());
vi.mock('@/services/nativeChrome',()=>({PREHIDE_COMPOSE_CHROME:true}));
vi.mock('@/utils/visualizerFrameChannel',()=>({setVisualizerRenderingSuspended:suspend}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement,raf:Map<number,FrameRequestCallback>,id=0;
function Probe({visible,active=true,model='stage'}:{visible:boolean;active?:boolean;model?:string}){
    const value=useNativeStagePresentation(visible,active,model);
    return h('div',null,value.mounted?value.model:'unmounted');
}
const frame=()=>act(()=>{const callbacks=[...raf.values()];raf.clear();callbacks.forEach(cb=>cb(0))});
beforeEach(()=>{
    vi.useFakeTimers();vi.clearAllMocks();raf=new Map();
    vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{raf.set(++id,cb);return id});
    vi.stubGlobal('cancelAnimationFrame',(id:number)=>raf.delete(id));
    host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.unstubAllGlobals();vi.useRealTimers()});
it('keeps the exact last stage model through two home paints before retiring it',()=>{
    act(()=>root.render(h(Probe,{visible:true})));
    act(()=>root.render(h(Probe,{visible:false,model:'home'})));
    expect(host.textContent).toBe('stage');frame();frame();
    expect(host.textContent).toBe('stage');act(()=>vi.advanceTimersByTime(32));
    expect(host.textContent).toBe('unmounted');expect(suspend).toHaveBeenLastCalledWith(false);
});
it('cancels stale retirement when reopening immediately and releases it on app background',()=>{
    act(()=>root.render(h(Probe,{visible:true})));
    act(()=>root.render(h(Probe,{visible:false})));frame();
    act(()=>root.render(h(Probe,{visible:true,model:'new stage'})));frame();
    act(()=>vi.advanceTimersByTime(500));expect(host.textContent).toBe('new stage');
    act(()=>root.render(h(Probe,{visible:true,active:false})));
    expect(host.textContent).toBe('unmounted');expect(raf.size).toBe(0);
});

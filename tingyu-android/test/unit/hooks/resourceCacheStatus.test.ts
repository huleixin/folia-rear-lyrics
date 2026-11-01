// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {useResourceCacheStatus} from '@/components/modal/settings/useResourceCacheStatus';
// test/unit/hooks/resourceCacheStatus.test.ts
const read=vi.hoisted(()=>vi.fn());
vi.mock('@/platform/runtime',()=>({isCapacitorAndroid:()=>true}));
vi.mock('@/platform/tingyuPlayback',()=>({getTingyuPlayback:()=>({resourceCache:read})}));
it('polls only while visible, immediately refreshes on return and never invokes a mutation',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();let visible='visible';
 Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visible});
 read.mockResolvedValue({completed:72,total:396});const root=createRoot(document.createElement('div'));
 function Probe(){const {status}=useResourceCacheStatus();return h('span',null,status?.completed);}
 try{
  await act(async()=>root.render(h(Probe)));expect(read).toHaveBeenCalledTimes(1);
  await act(async()=>vi.advanceTimersByTimeAsync(4000));expect(read).toHaveBeenCalledTimes(2);
  visible='hidden';document.dispatchEvent(new Event('visibilitychange'));
  await act(async()=>vi.advanceTimersByTimeAsync(12000));expect(read).toHaveBeenCalledTimes(2);
  visible='visible';read.mockResolvedValue({completed:96,total:396});await act(async()=>document.dispatchEvent(new Event('visibilitychange')));
  expect(read).toHaveBeenCalledTimes(3);expect(read.mock.calls.every(([o])=>!o.action)).toBe(true);
  await act(async()=>root.unmount());await vi.advanceTimersByTimeAsync(8000);expect(read).toHaveBeenCalledTimes(3);
 }finally{vi.useRealTimers();}
});

it('ignores a late response from the previous visibility epoch',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;let visible='visible';Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visible});
 let first!:(value:unknown)=>void;read.mockReset();read.mockReturnValueOnce(new Promise(resolve=>{first=resolve;})).mockResolvedValue({completed:96,total:396});
 const host=document.createElement('div'),root=createRoot(host);
 function Probe(){const {status}=useResourceCacheStatus();return h('span',null,status?.completed);}
 await act(async()=>root.render(h(Probe)));
 visible='hidden';document.dispatchEvent(new Event('visibilitychange'));visible='visible';await act(async()=>document.dispatchEvent(new Event('visibilitychange')));
 await act(async()=>first({completed:72,total:396}));expect(host.textContent).toBe('96');await act(async()=>root.unmount());
});

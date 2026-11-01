// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {useSleepTimer} from '@/hooks/useSleepTimer';
// test/unit/hooks/nativeSleepHook.test.ts
const mocks=vi.hoisted(()=>({install:vi.fn(async()=>()=>{})}));
vi.mock('@/platform/runtime',()=>({isCapacitorAndroid:()=>true}));
vi.mock('@/services/nativeSleepTimer',()=>({installNativeSleepTimer:mocks.install}));
it('Android never uses the JS expiry fallback, even after the entire duration',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();const fallback=vi.fn(),root=createRoot(document.createElement('div'));
 function Probe(){useSleepTimer({enabled:true,hours:0,minutes:15,onExpireFallback:fallback});return null;}
 try{await act(async()=>root.render(h(Probe)));await act(async()=>vi.advanceTimersByTimeAsync(3600000));expect(fallback).not.toHaveBeenCalled();expect(mocks.install).toHaveBeenCalledOnce();}
 finally{await act(async()=>root.unmount());vi.useRealTimers();}
});

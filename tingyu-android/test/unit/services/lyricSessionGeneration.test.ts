// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

// test/unit/services/lyricSessionGeneration.test.ts
// The generation is what a consumer uses to reject a stale timeline. A module-level counter
// restarts at zero on every WebView reload - which is exactly what Android does to a background
// renderer during a long session - so every payload after that carried a number the consumer had
// already seen and passed. Persisting it is the whole point of the field.
beforeEach(()=>{window.localStorage.clear();vi.resetModules();});

it('counts up within one page session',async()=>{
    const generation=await import('@/services/lyricSessionGeneration');
    const first=generation.nextColorOsGeneration();
    expect(generation.nextColorOsGeneration()).toBe(first+1);
});

it('does not go backwards after the WebView is reloaded',async()=>{
    const first=await import('@/services/lyricSessionGeneration');
    first.nextColorOsGeneration();
    const last=first.nextColorOsGeneration();
    vi.resetModules();
    const reloaded=await import('@/services/lyricSessionGeneration');
    expect(reloaded.currentColorOsGeneration()).toBe(last);
    expect(reloaded.nextColorOsGeneration()).toBe(last+1);
});

it('survives a storage failure without producing a zero generation',async()=>{
    const original=window.localStorage.setItem.bind(window.localStorage);
    const spy=vi.spyOn(window.localStorage,'setItem').mockImplementation(()=>{throw new Error('quota');});
    try{
        const generation=await import('@/services/lyricSessionGeneration');
        expect(generation.nextColorOsGeneration()).toBe(1);
        expect(generation.nextColorOsGeneration()).toBe(2);
    }finally{spy.mockRestore();original('__x','1');}
});

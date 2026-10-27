import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromeClockNeedsAnchor, newChromeGeneration } from '../../src/services/nativeChrome';

// test/unit/nativeChrome.test.ts
afterEach(()=>vi.restoreAllMocks());
describe('native chrome bridge clock',()=>{
    it('keeps normal playback below one anchor every two seconds',()=>{
        for(let ms=16;ms<2000;ms+=16)expect(chromeClockNeedsAnchor(ms,0,10+ms/1000,10,true)).toBe(false);
        expect(chromeClockNeedsAnchor(2000,0,12,10,true)).toBe(true);
    });
    it('anchors seeks immediately and ignores invalid samples',()=>{
        expect(chromeClockNeedsAnchor(50,0,40,10,true)).toBe(true);
        expect(chromeClockNeedsAnchor(50,0,NaN,10,true)).toBe(false);
        expect(chromeClockNeedsAnchor(50,0,Infinity,10,true)).toBe(false);
        expect(chromeClockNeedsAnchor(50,0,10,10,false)).toBe(false);
    });
    it('orders remounts even within a millisecond or after system clock changes',()=>{
        vi.spyOn(Date,'now').mockReturnValue(1000);
        const first=newChromeGeneration();
        expect(newChromeGeneration()).toBeGreaterThan(first);
        vi.mocked(Date.now).mockReturnValue(500);
        expect(newChromeGeneration()).toBeGreaterThan(first+1);
    });
});

// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCoverColors, clearCoverPaletteCache } from '@/components/app/overlays/minimal-stage/useCoverPalette';

// test/unit/hooks/minimalCoverPalette.test.ts
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
let images: FakeImage[]=[];
class FakeImage { src=''; onload:(()=>void)|null=null; onerror:(()=>void)|null=null; constructor(){images.push(this);} }
let root:Root; let color:ReturnType<typeof useCoverColors>; let drawn:FakeImage;
const Harness=({url}:{url:string|null})=>{color=useCoverColors(url);return null;};
const render=(url:string|null)=>act(()=>root.render(React.createElement(Harness,{url})));
const succeed=(i:number)=>act(async()=>{images[i].onload?.(); await Promise.resolve();});
beforeEach(()=>{
    vi.useFakeTimers(); images=[]; clearCoverPaletteCache();vi.stubGlobal('Image',FakeImage);
    vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({
        drawImage:(image:FakeImage)=>{drawn=image;},getImageData:()=>({data:new Uint8ClampedArray(Array.from({length:784},()=>drawn.src==='red'?[220,70,60,255]:[60,90,220,255]).flat())}),
    } as never);root=createRoot(document.createElement('div'));
});
afterEach(()=>{act(()=>root.unmount());vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
it('bridges a temporary empty artwork URL without a fallback flash and ignores old samples',async()=>{
    render('red');await succeed(0);const red=color;expect(red).not.toBeNull();
    render(null);await act(async()=>{await vi.advanceTimersByTimeAsync(200)});expect(color).toBe(red);
    render('blue');expect(color).toBe(red);await succeed(1);const blue=color;expect(blue).not.toEqual(red);
    await succeed(0);expect(color).toBe(blue);
    render(null);await act(async()=>{await vi.advanceTimersByTimeAsync(400)});expect(color).toBeNull();
});

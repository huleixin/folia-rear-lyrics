import {expect,it} from 'vitest';
import {parseColorChannels,colorWithAlpha,mixColors} from '@/components/visualizer/colorMix';
import {minimalAuroraGlow} from '@/components/app/overlays/minimal-stage/MinimalAmbience';

// test/unit/utils/colorMix.test.ts
it('reads modern palette RGB and slash alpha, as well as existing comma syntax',()=>{
    for(const value of ['rgb(57 31 84)','rgb(57 31 84 / .5)','rgba(57, 31, 84, .5)'])
        expect(parseColorChannels(value)).toEqual({r:57,g:31,b:84});
    expect(parseColorChannels('rgb(100% 0% 0%)')).toEqual({r:255,g:0,b:0});
    expect(colorWithAlpha('rgb(57 31 84)',.3)).toBe('rgba(57, 31, 84, 0.3)');
    expect(mixColors('rgb(0 0 0)','#ffffff',.5)).toBe('rgba(128, 128, 128, 1)');
});
it('really brightens a dark cover field rather than returning its unparsed dark input',()=>{
    const value=minimalAuroraGlow('rgb(57 31 84)');
    const rgb=parseColorChannels(value)!;
    expect(value).not.toBe('rgb(57 31 84)');
    expect(Math.max(rgb.r,rgb.g,rgb.b)).toBeGreaterThan(180);
    expect(rgb.b).toBeGreaterThan(rgb.r);expect(rgb.r).toBeGreaterThan(rgb.g);
});

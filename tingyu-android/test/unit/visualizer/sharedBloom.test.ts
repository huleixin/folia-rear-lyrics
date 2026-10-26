import {expect,it,vi} from 'vitest';
import {createBloomFilter} from '@/components/visualizer/pixi/bloomFilter';

// test/unit/visualizer/sharedBloom.test.ts
// Tiny animated filter bounds must not abort a frame; normal passes return every pooled texture.
it('passes through subpixel bloom regions and releases normal down/up-sampling textures',()=>{
    const texture=(width:number,height:number,resolution=1)=>({frame:{width,height},source:{width,height,pixelWidth:width*resolution,pixelHeight:height*resolution,resolution}});
    class UniformGroup{uniforms:Record<string,unknown>;constructor(values:Record<string,{value:unknown}>){this.uniforms=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v.value]));}update(){}}
    class Filter{resources:Record<string,unknown>;blendMode='normal';padding=0;constructor(options:{resources:Record<string,unknown>}){this.resources=options.resources;}destroy(){}}
    const pool={getOptimalTexture:vi.fn(({width,height,resolution}:{width:number;height:number;resolution:number})=>texture(width,height,resolution)),returnTexture:vi.fn()};
    const pixi={Filter,UniformGroup,GlProgram:{from:()=>({})},RendererType:{BOTH:3},Texture:{EMPTY:texture(1,1)},TexturePool:pool};
    const filter=createBloomFilter(pixi as never,{strength:1,threshold:.5,knee:.2,levels:2,spread:.5,padding:0,tint:[1,1,1]});
    const manager={applyFilter:vi.fn()};
    filter.apply(manager as never,texture(1,1) as never,{} as never,true);
    expect(manager.applyFilter).toHaveBeenCalledTimes(1);expect(pool.getOptimalTexture).not.toHaveBeenCalled();
    manager.applyFilter.mockClear();filter.apply(manager as never,texture(64,64) as never,{} as never,true);
    expect(manager.applyFilter).toHaveBeenCalledTimes(4);expect(pool.getOptimalTexture).toHaveBeenCalledTimes(3);expect(pool.returnTexture).toHaveBeenCalledTimes(3);
    filter.destroy();
});

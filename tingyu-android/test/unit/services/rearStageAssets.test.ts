import {it,expect,vi} from 'vitest';
import {materializeRearStageAssets} from '@/services/rearStageAssets';
import type {RearAppearanceData} from '@/services/rearStageAppearance';
const images=vi.hoisted(()=>new Map<string,any>());
vi.mock('@/services/temperaLayerImages',()=>({getTemperaLayerImage:async(id:string)=>images.get(id),saveTemperaLayerImage:async(value:any)=>images.set(value.id,value)}));
// test/unit/services/rearStageAssets.test.ts
it('independent Tempera bytes/ids cannot delete front assets and restore from their own backup',async()=>{
    const blob=new Blob(['front']);images.set('front-image',{id:'front-image',blob});
    const profile={visual:{temperaLayerImageAssets:[{id:'front-image',name:'art',url:'data:image/png;base64,YQ=='}],visualizerTunings:{tempera:{layerImages:[{id:'front-image'}]}}},font:null} as unknown as NonNullable<RearAppearanceData['profile']>;
    const rear=await materializeRearStageAssets(profile,true),id=rear.visual.temperaLayerImageAssets![0].id;
    expect(id).not.toBe('front-image');expect(rear.visual.visualizerTunings!.tempera!.layerImages[0].id).toBe(id);expect(images.get('front-image').blob).toBe(blob);
    images.delete(id);await materializeRearStageAssets(rear);expect(images.has(id)).toBe(true);expect(images.has('front-image')).toBe(true);
});

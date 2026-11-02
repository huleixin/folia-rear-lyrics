import type {RearAppearanceData} from './rearStageAppearance';

// src/services/rearStageAssets.ts
// Tempera's existing image manager deletes by id. Give the rear its own ids/bytes so
// removing a rear canvas image cannot delete an image still used on the front.
export async function materializeRearStageAssets(profile:NonNullable<RearAppearanceData['profile']>,copy=false){
    const assets=profile.visual.temperaLayerImageAssets;
    if(!assets?.length)return profile;
    const {getTemperaLayerImage,saveTemperaLayerImage}=await import('./temperaLayerImages');
    const ids=new Map<string,string>();
    const next=await Promise.all(assets.map(async asset=>{
        const id=copy||!asset.id.startsWith('rear-stage-')?'rear-stage-'+crypto.randomUUID():asset.id;ids.set(asset.id,id);
        if(!await getTemperaLayerImage(id)){
            if(!asset.url.startsWith('data:image/'))throw new Error('背屏画布素材缺少可保存的图片内容');
            const blob=await (await fetch(asset.url)).blob();await saveTemperaLayerImage({id,name:asset.name,mimeType:blob.type,blob});
        }
        return {...asset,id};
    }));
    const tuning=profile.visual.visualizerTunings?.tempera;
    return {...profile,visual:{...profile.visual,temperaLayerImageAssets:next,visualizerTunings:{...profile.visual.visualizerTunings,...(tuning?{tempera:{...tuning,layerImages:tuning.layerImages.map(image=>({...image,id:ids.get(image.id)??image.id}))}}:{})}}};
}
export async function resolveRearTemperaAssets(images:{id:string}[]){
    const {getTemperaLayerImage}=await import('./temperaLayerImages');
    return Promise.all(images.map(async image=>{const asset=await getTemperaLayerImage(image.id);if(!asset)throw new Error('背屏画布图片未保存');
        const url=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(asset.blob);});
        return{id:image.id,name:asset.name,url};}));
}

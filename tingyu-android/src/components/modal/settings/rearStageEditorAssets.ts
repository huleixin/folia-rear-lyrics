import type {ComponentProps} from 'react';
import type VisPlayground from '../../visualizer/VisPlayground';
import {useRearStageAppearanceStore} from '../../../stores/useRearStageAppearanceStore';
import {isSupportedMonetBackgroundFile} from '../../../services/monetBackgroundImage';
import {isSupportedLyricsFontFile} from '../../../services/customLyricsFont';

// src/components/modal/settings/rearStageEditorAssets.ts
// Store independent bytes; clearing/replacing a front asset cannot invalidate this profile.
const dataUrl=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
async function images(files:File[]){
    if(!files.length||files.some(file=>!isSupportedMonetBackgroundFile(file)||file.size>10*1024*1024))throw new Error('请选择支持的图片，每张不超过 10 MB');
    return Promise.all(files.map(async file=>({id:crypto.randomUUID(),name:file.name,url:await dataUrl(file)})));
}
export function rearStageEditorAssets():Partial<ComponentProps<typeof VisPlayground>>{
    const patch=useRearStageAppearanceStore.getState().patch;
    const profile=()=>useRearStageAppearanceStore.getState().profile!.visual;
    const upload=(apply:(assets:Awaited<ReturnType<typeof images>>)=>void)=>(files:File[])=>images(files).then(value=>{apply(value);return{ok:true};}).catch(error=>({ok:false,error:String(error.message??error)}));
    return {
        onUploadCustomFont:async file=>{try{
            if(!isSupportedLyricsFontFile(file)||file.size>50*1024*1024)throw new Error('请选择支持的字体，大小不超过 50 MB');
            const url=await dataUrl(file),id=crypto.randomUUID(),family='TingyuRearFont_'+id.replaceAll('-','');
            const face=await new FontFace(family,`url("${url}")`).load();document.fonts.add(face);
            patch({theme:{...profile().theme,fontFamily:family}},{id,family,url});return{ok:true};
        }catch(error){return{ok:false,error:String(error)};}},
        onUploadMonetPortraitImage:upload(value=>patch({monetPortraitImage:value[0]})),onClearMonetPortraitImage:()=>patch({monetPortraitImage:null}),
        onImportCappellaCustomEmojiPack:upload(value=>patch({cappellaCustomEmojiImages:value})),onClearCappellaCustomEmojiPack:()=>patch({cappellaCustomEmojiImages:[]}),
        onImportCappellaCustomAvatar:upload(value=>patch({cappellaCustomAvatarImages:value})),onClearCappellaCustomAvatar:()=>patch({cappellaCustomAvatarImages:[]}),
    };
}
export function rearBackgroundAssets(){
    const state=()=>useRearStageAppearanceStore.getState();
    return{onUpload:async(files:File[])=>{try{const values=await images(files);state().patch({background:{...state().profile!.visual.background,customImage:values[0]}});return{ok:true};}catch(error){return{ok:false,error:String(error)};}},onClear:()=>state().patch({background:{...state().profile!.visual.background,customImage:null}})};
}

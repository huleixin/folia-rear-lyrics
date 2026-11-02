import type {DualTheme} from '../types';
import {materializeRearStageAssets,resolveRearTemperaAssets} from '../services/rearStageAssets';
import {create} from 'zustand';
import {captureRearVisual,validateRearAppearance,type RearAppearanceData,type RearVisualConfig} from '../services/rearStageAppearance';
import type {ObsBrowserSourceConfig} from '../types/obsBrowserSource';
import type {RearUploadedFont} from '../services/rearLyricsFont';

// src/stores/useRearStageAppearanceStore.ts
// One rear profile for both LSP and Shizuku. Binary-derived visual assets live in IndexedDB,
// separate from evictable caches and playback session data; front settings are never swapped.
const initial:RearAppearanceData={version:1,mode:'follow',profile:null};
let loading:Promise<void>|undefined,writes:Promise<unknown>=Promise.resolve(),writeRevision=0;
type State=RearAppearanceData&{ready:boolean;error:string;front:RearAppearanceData['profile'];frontReady:boolean;
    initialize:()=>Promise<void>;observeFront:(config:ObsBrowserSourceConfig,font:RearUploadedFont|null)=>void;
    setMode:(mode:RearAppearanceData['mode'])=>Promise<void>;patch:(patch:Partial<RearVisualConfig>,font?:RearUploadedFont|null,themes?:DualTheme)=>void;restore:(value:unknown)=>Promise<void>};
async function save(data:RearAppearanceData){
    const revision=++writeRevision;
    writes=writes.catch(()=>{}).then(async()=>{if(revision!==writeRevision)return;const {appDatabase}=await import('../services/appDatabase');if(revision===writeRevision)await appDatabase.appearance_profiles.put({id:'rear-stage',data});});
    await writes;
}
export const useRearStageAppearanceStore=create<State>((set,get)=>({...initial,ready:false,error:'',front:null,frontReady:false,
    initialize:()=>loading??(loading=(async()=>{try{const {appDatabase}=await import('../services/appDatabase');const stored=await appDatabase.appearance_profiles.get('rear-stage');if(stored){const data=validateRearAppearance(stored.data);if(data.profile)data.profile=await materializeRearStageAssets(data.profile);set(data);}set({ready:true});}catch{set({ready:true,error:'背屏外观读取失败，请重试或检查存储空间'});}})()),
    observeFront:(config,font)=>set({front:{visual:captureRearVisual(config),font},frontReady:config.visualAssetsReady!==false}),
    setMode:async mode=>{await get().initialize();const state=get();if(!state.frontReady&&!state.profile&&mode==='independent')throw new Error('正面舞台素材正在准备，请稍后再试');const next:RearAppearanceData={version:1,mode,profile:state.profile??(mode==='independent'?structuredClone(state.front):null)};if(mode==='independent'&&!state.profile&&next.profile){next.profile.themes={light:structuredClone(next.profile.visual.theme),dark:structuredClone(next.profile.visual.theme)};next.profile=await materializeRearStageAssets(next.profile,true);}await save(next);set({...next,error:''});},
    patch:(patch,font,themes)=>{const profile=get().profile;if(!profile||get().mode!=='independent')return;const palette=themes??profile.themes;const daylight=patch.isDaylight??profile.visual.isDaylight;
        const next={...profile,themes:palette,visual:{...profile.visual,...patch,...(patch.isDaylight!==undefined&&palette&&!patch.theme?{theme:palette[daylight?'light':'dark']}:{})},...(font!==undefined?{font}:{})};if(patch.theme&&next.themes)next.themes={...next.themes,[daylight?'light':'dark']:patch.theme};
        if(themes)next.visual.theme=themes[daylight?'light':'dark'];
        set({profile:next,error:''});
        const images=patch.visualizerTunings?.tempera?.layerImages;
        if(images)void resolveRearTemperaAssets(images).then(assets=>{if(get().profile?.visual.visualizerTunings?.tempera?.layerImages===images)get().patch({temperaLayerImageAssets:assets});}).catch(()=>set({error:'背屏画布素材尚未保存，请重试'}));
        void save({version:1,mode:get().mode,profile:next}).catch(()=>set({error:'背屏外观尚未保存，请检查存储空间后重试'}));},
    restore:async value=>{await get().initialize();const next=validateRearAppearance(value);if(next.profile)next.profile=await materializeRearStageAssets(next.profile,true);await save(next);set({...next,error:''});},
}));
export const exportRearAppearance=():RearAppearanceData=>{const {version,mode,profile}=useRearStageAppearanceStore.getState();return{version,mode,profile};};

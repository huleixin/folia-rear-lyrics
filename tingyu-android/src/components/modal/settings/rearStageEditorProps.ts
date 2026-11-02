import * as stageDefaults from '../../../types';
import type {ComponentProps} from 'react';
import type VisPlayground from '../../visualizer/VisPlayground';
import type {RearVisualConfig} from '../../../services/rearStageAppearance';
import {useRearStageAppearanceStore} from '../../../stores/useRearStageAppearanceStore';
import type {Theme,VisualizerMode} from '../../../types';

// src/components/modal/settings/rearStageEditorProps.ts
// Adapt the existing controlled editor; never call a front-store action from this scope.
export function rearStageEditorProps(visual:RearVisualConfig,onClose:()=>void):ComponentProps<typeof VisPlayground>{
    const patch=useRearStageAppearanceStore.getState().patch;
    const defaults=stageDefaults as unknown as Record<string,object>;
    const backgroundDefaults=Object.fromEntries(['monet','nomand','latent','sora'].map(key=>[key,defaults[`DEFAULT_${key.toUpperCase()}_BACKGROUND_TUNING`]]));
    const theme=(value:Partial<Theme>)=>patch({theme:{...useRearStageAppearanceStore.getState().profile!.visual.theme,...value}});
    const current=()=>useRearStageAppearanceStore.getState().profile!.visual;
    const background=(value:Partial<NonNullable<RearVisualConfig['background']>>)=>patch({background:{...current().background,...value}});
    const result:Record<string,unknown>={...visual,rearScope:true,theme:visual.theme,fontStyle:visual.theme.fontStyle,fontScale:visual.lyricsFontScale,fontWeight:visual.theme.fontWeight??null,
        customFontFamily:visual.theme.fontFamily??null,customFontLabel:visual.theme.fontFamily??null,fontFallbackFamilies:visual.theme.fontFamilyStack,
        subtitleFontInheritsLyrics:!visual.subtitleTheme,subtitleFontStyle:visual.subtitleTheme?.fontStyle,subtitleFontWeight:visual.subtitleTheme?.fontWeight??null,subtitleFontFamily:visual.subtitleTheme?.fontFamily,subtitleFontFallbackFamilies:visual.subtitleTheme?.fontFamilyStack,
        onSubtitleFontInheritsLyricsChange:(inherit:boolean)=>patch({subtitleTheme:inherit?undefined:{...current().theme}}),
        ...Object.fromEntries(Object.entries({Style:'fontStyle',Weight:'fontWeight',Family:'fontFamily',FallbackFamilies:'fontFamilyStack'}).map(([handler,key])=>[`onSubtitleFont${handler}Change`,(value:unknown)=>patch({subtitleTheme:{...current().theme,...current().subtitleTheme,[key]:value}})])),
        backgroundConfig:{...visual.background,...Object.fromEntries(Object.entries(backgroundDefaults).map(([key,value])=>[key,{...(visual.background as any)?.[key],tuning:{...value,...(visual.background as any)?.[key]?.tuning}}]))},onClose,onFontStyleChange:(fontStyle:Theme['fontStyle'])=>theme({fontStyle,fontFamily:undefined}),
        onFontScaleChange:(lyricsFontScale:number)=>patch({lyricsFontScale}),onFontWeightChange:(fontWeight:number|null)=>theme({fontWeight:fontWeight??undefined}),
        onCustomFontChange:(font:{family:string}|null)=>{theme({fontFamily:font?.family});if(!font)patch({},null);},
        onFontFallbackFamiliesChange:(fontFamilyStack:string[])=>theme({fontFamilyStack}),
        onVisualizerModeChange:(visualizerMode:VisualizerMode)=>patch({visualizerMode})};
    for(const [handler,key] of Object.entries({VisualizerOpacity:'visualizerOpacity',SubtitleFontScale:'subtitleFontScale',HideTranslationSubtitle:'hideTranslationSubtitle',ShowSubtitleTranslation:'showSubtitleTranslation',SubtitleContentMode:'subtitleContentMode',SubtitleOverlayOpacity:'subtitleOverlayOpacity',SubtitleOverlayBackground:'subtitleOverlayBackground',SubtitleUpcomingLyricsBlur:'subtitleUpcomingLyricsBlur',ShowHarmonySubtitle:'showHarmonySubtitle',HarmonySubtitleBackground:'harmonySubtitleBackground'})){
        const fn=(value:unknown)=>patch({[key]:value});result[`on${handler}Change`]=fn;result[`onToggle${handler}`]=fn;
    }
    for(const mode of ['classic','cadenza','partita','fume','claddagh','cappella','tilt','diorama','monet','pendolo','sonnet','tempera','lumiere'] as const){
        const name=mode[0].toUpperCase()+mode.slice(1);
        result[`${mode}Tuning`]=visual.visualizerTunings?.[mode];
        result[`on${name}TuningChange`]=(value:object)=>patch({visualizerTunings:{...current().visualizerTunings,[mode]:{...defaults[`DEFAULT_${mode.toUpperCase()}_TUNING`],...current().visualizerTunings?.[mode],...value}}});
        result[`onReset${name}Tuning`]=()=>{const next={...current().visualizerTunings};delete next[mode];patch({visualizerTunings:next});};
    }
    result.backgroundActions={onModeChange:(mode:NonNullable<RearVisualConfig['background']>['mode'])=>background({mode}),
        common:Object.fromEntries(Object.entries({CoverColor:'useCoverColorBg',Opacity:'opacity',DisableGeometric:'disableGeometricBackground',DisableVignette:'disableVignette'}).map(([handler,key])=>[`on${handler}Change`,(value:unknown)=>background({common:{...current().background?.common,[key]:value}})])),
        ...Object.fromEntries(['monet','nomand','latent','sora'].map(key=>[key,{onTuningChange:(value:object)=>{const b=current().background as any;background({[key]:{tuning:{...backgroundDefaults[key],...b?.[key]?.tuning,...value}}});},onResetTuning:()=>background({[key]:undefined})}])),
        url:{onAdd:(item:any)=>background({url:{...current().background?.url,items:[...current().background?.url?.items??[],item]}}),onSelect:(selectedId:string|null)=>background({url:{...current().background?.url,selectedId}}),onDelete:(id:string)=>background({url:{...current().background?.url,items:current().background?.url?.items?.filter(v=>v.id!==id)}}),onUpdate:(id:string,value:object)=>background({url:{...current().background?.url,items:current().background?.url?.items?.map(v=>v.id===id?{...v,...value}:v)}})}};
    return result as unknown as ComponentProps<typeof VisPlayground>;
}

import {scheduleUiWarmup} from '../../../services/uiWarmup';
import {navigationMark} from '../../../services/navigationTiming';

// src/components/modal/settings/rearAppearanceModules.ts
// Shared promises deduplicate speculative loading and an explicit navigation.
let theme:ReturnType<typeof importTheme>|undefined;
let loadedTheme:Awaited<ReturnType<typeof importTheme>>|undefined;
function importTheme(){return import('../../panelTab/ThemeQuickEditor').then(module=>({default:module.ThemeQuickEditor}));}
export const peekRearThemeEditor=()=>loadedTheme?.default;
export function loadRearThemeEditor(){
    return theme??(theme=(async()=>{
        const started=performance.timeOrigin+performance.now();navigationMark('rear-theme-module-start');
        try{return loadedTheme=await importTheme();}
        catch(error){theme=undefined;throw error;}
        finally{navigationMark('rear-theme-module-end',started);}
    })());
}
export const warmRearThemeEditor=()=>scheduleUiWarmup(loadRearThemeEditor);

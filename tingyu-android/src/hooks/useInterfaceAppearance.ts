import {useEffect} from 'react';
import {useThemeSettingsStore} from '../stores/useThemeSettingsStore';
import {isAndroidNativeRuntime} from '../utils/platform';
import {chromeNative} from '../services/nativeChrome';
import {INTERFACE_APPEARANCE_EVENT,INTERFACE_APPEARANCE_KEY,INTERFACE_THEME_KEY,resolveInterfaceLight} from '../services/interfaceAppearance';
import {interfaceThemes,resolveInterfaceTheme} from '../theme/interfaceThemes.generated';
import '../styles/interfaceAppearance.css';
import '../styles/interfaceThemes.generated.css';
import '../styles/interfaceSemantic.css';

export const selectInterfaceLight = (state: ReturnType<typeof useThemeSettingsStore.getState>) =>
    isAndroidNativeRuntime() ? resolveInterfaceLight(state.interfaceAppearance,state.interfaceSystemLight) : state.isDaylight;
export const useInterfaceLight = (webFallback?:boolean) => {
    const resolved=useThemeSettingsStore(selectInterfaceLight);
    return !isAndroidNativeRuntime()&&webFallback!==undefined?webFallback:resolved;
};

function paintPreference() {
    if (!isAndroidNativeRuntime()) return;
    const state=useThemeSettingsStore.getState();
    const light=selectInterfaceLight(state);
    const style=resolveInterfaceTheme(state.interfaceTheme);
    const root=document.documentElement;
    if(root.dataset.interfaceAppearance===(light?'light':'dark') && root.dataset.interfaceTheme===style)return;
    root.dataset.interfaceTheme=style;
    root.dataset.interfacePalette=style==='classic'?'classic':'semantic';
    const palette=interfaceThemes[style][light?'light':'dark'].native;
    const ink='#'+palette.launchInk.hex.slice(2);
    root.dataset.launchLight=String(light);
    root.style.setProperty('--ty-launch-bg','#'+palette.launch.hex.slice(2));
    root.style.setProperty('--ty-launch-ink',ink);
    root.style.setProperty('--ty-launch-rgb',[1,3,5].map(i=>parseInt(ink.slice(i,i+2),16)).join(','));
    root.dataset.interfaceAppearance=light?'light':'dark';
    document.dispatchEvent(new Event(INTERFACE_APPEARANCE_EVENT));
}
// Set the CSS scope before React's first frame, without touching the stage's tokens.
paintPreference();

export function useInterfaceAppearanceSync() {
    useEffect(()=>{
        if(!isAndroidNativeRuntime())return;
        let disposed=false,systemRevision=0;
        let writes=Promise.resolve();
        const send=()=>{
            paintPreference();
            const mode=useThemeSettingsStore.getState().interfaceAppearance;
            const style=useThemeSettingsStore.getState().interfaceTheme;
            const current=()=>mode===useThemeSettingsStore.getState().interfaceAppearance && style===useThemeSettingsStore.getState().interfaceTheme;
            // Serial writes prevent an earlier bridge request winning after a rapid toggle.
            writes=writes.then(async()=>{
                if(disposed || !current())return;
                try {
                    const started=systemRevision;
                    const result=await chromeNative.appearance({mode,style});
                    if(!disposed && started===systemRevision && current())
                        useThemeSettingsStore.getState().setInterfaceSystemLight(result.systemLight);
                } catch { /* Web fallback retains the same CSS preference; retry on resume. */ }
            });
        };
        const unsubscribe=useThemeSettingsStore.subscribe((state,previous)=>{
            if(state.interfaceAppearance!==previous.interfaceAppearance || state.interfaceTheme!==previous.interfaceTheme)send();
            else if(state.interfaceSystemLight!==previous.interfaceSystemLight)paintPreference();
        });
        const listener=chromeNative.addListener('appearanceChanged',value=>{
            if(!disposed){systemRevision++;useThemeSettingsStore.getState().setInterfaceSystemLight(value.systemLight);}
        }).catch(()=>null);
        const media=window.matchMedia('(prefers-color-scheme: light)');
        const system=()=>{systemRevision++;useThemeSettingsStore.getState().setInterfaceSystemLight(media.matches);};
        media.addEventListener('change',system);
        const resume=()=>{if(document.visibilityState==='visible')send();};
        document.addEventListener('visibilitychange',resume);
        // The mirror only seeds startup; JS remains the sole owner of the user preference.
        const startupRevision=systemRevision;
        void chromeNative.appearance({}).then(result=>{
            if(disposed)return;
            if(!localStorage.getItem(INTERFACE_APPEARANCE_KEY))useThemeSettingsStore.getState().setInterfaceAppearance(result.mode);
            if(!localStorage.getItem(INTERFACE_THEME_KEY))useThemeSettingsStore.getState().setInterfaceTheme(resolveInterfaceTheme(result.style));
            if(startupRevision===systemRevision)useThemeSettingsStore.getState().setInterfaceSystemLight(result.systemLight);
            send();
        }).catch(send);
        return()=>{disposed=true;unsubscribe();void listener.then(handle=>handle?.remove());media.removeEventListener('change',system);document.removeEventListener('visibilitychange',resume);};
    },[]);
}

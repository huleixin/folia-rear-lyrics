import { Capacitor,type PluginListenerHandle } from '@capacitor/core';
import { getFoliaNative } from '../platform/foliaNative';

// src/services/androidMainInsets.ts
// Install before importing the React application. The request and retained event listener
// run in parallel; a route unmount cannot reset the process-owned startup safe rectangle.
type MainInsets={top:number;bottom:number;left:number;right:number};
const native=getFoliaNative<{getMainWindowInsets:()=>Promise<MainInsets>;addListener:(name:string,listener:(value:MainInsets)=>void)=>Promise<PluginListenerHandle>}>();
let current:{owners:number;stop:()=>void}|undefined;
export function installAndroidMainInsets(){
    if(Capacitor.getPlatform()!=='android')return()=>{};
    if(!current){
        let disposed=false,revision=0,handle:PluginListenerHandle|undefined;
        const apply=(value:MainInsets)=>{if(disposed)return;for(const side of ['top','bottom','left','right'] as const)
            if(Number.isFinite(value[side])&&value[side]>=0)document.documentElement.style.setProperty(`--folia-main-inset-${side}`,`${value[side]}px`)};
        current={owners:0,stop:()=>{disposed=true;void handle?.remove();for(const side of ['top','bottom','left','right'])document.documentElement.style.removeProperty(`--folia-main-inset-${side}`)}};
        void native.addListener('mainWindowInsetsChanged',value=>{revision++;apply(value)}).then(listener=>{if(disposed)void listener.remove();else handle=listener}).catch(()=>{});
        const requestedAt=revision;
        void native.getMainWindowInsets().then(value=>{if(revision===requestedAt)apply(value)}).catch(()=>{});
    }
    const session=current;session.owners++;let released=false;
    return()=>{if(released)return;released=true;if(--session.owners===0){session.stop();if(current===session)current=undefined}};
}

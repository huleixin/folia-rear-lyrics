import { registerPlugin } from '@capacitor/core';
import { isAndroidNativeRuntime } from '../utils/platform';
import type { NativePageEvent, NativePageFrame, NativePageId } from '../types/nativePages';

// src/services/nativeChrome.ts
export const COMPOSE_CHROME = import.meta.env.VITE_TINGYU_COMPOSE_CHROME === 'true';
export const PREHIDE_COMPOSE_CHROME = COMPOSE_CHROME && isAndroidNativeRuntime();
export const COMPOSE_CHROME_FAILURE_EVENT = 'tingyu-compose-chrome-failed';
export type ChromeSurfaceId = 'nav' | 'mini' | 'stage';
export type ChromeData = {
    title?: string; artist?: string; cover?: string; trackKey?: string; playing?: boolean; disabled?: boolean;
    canNext?: boolean; canPrevious?: boolean; duration?: number; selected?: number; loop?: string;
    light?: boolean; reducedMotion?: boolean; accent?: string; ink?: string; labels?: Record<string,string>; vertical?: boolean;
};
export type ChromeAction = {id: ChromeSurfaceId; session: string; action: string; value: number};
export type ChromeFrame = {id: ChromeSurfaceId; session: string; generation: number; revision: number; enabled: boolean;
    left: number; top: number; width: number; height: number; alpha: number; viewportWidth: number; safeBottom?:number; data: ChromeData & {position?: number}};
export const chromeNative = registerPlugin<{
    probe(): Promise<{supported:boolean;engine:string;pages?:boolean}>;
    update(frame: ChromeFrame): Promise<{accepted:boolean;session:string}>;
    clock(value:{id:ChromeSurfaceId;session:string;trackKey:string;position:number}):Promise<void>;
    remove(value:{id:ChromeSurfaceId;session:string}):Promise<void>;
    pageUpdate(frame:NativePageFrame):Promise<{accepted:boolean;session:string}>;
    pageRemove(value:{id:NativePageId;session:string}):Promise<void>;
    shell(value:{generation:number;revision:number;route:string;webOverlay:boolean;selectedTab:number;pageTarget?:string;entryKey?:string;reducedMotion?:boolean;navigation?:string}):Promise<void>;
    addListener(name:'action',callback:(value:ChromeAction)=>void):Promise<{remove:()=>Promise<void>}>;
    addListener(name:'pageAction',callback:(value:NativePageEvent)=>void):Promise<{remove:()=>Promise<void>}>;
}>('TingyuChrome');
let probe:Promise<boolean>|undefined;
let generation=0;
export function newChromeGeneration():number { return generation=Math.max(Date.now()*1000,generation+1); }
export function canUseComposeChrome():Promise<boolean> {
    if (!COMPOSE_CHROME || !isAndroidNativeRuntime()) return Promise.resolve(false);
    return probe ??= chromeNative.probe().then(value=>value.supported).catch(()=>false);
}
export function hasBlockingChromeWindow():boolean {
    // The stage's small top menu does not overlap the transport; sheets and dialogs do.
    return [...document.querySelectorAll<HTMLElement>('[data-folia-keyboard-window="true"]')]
        .some(node=>node.dataset.nativeChromeOverlay!=='nonblocking');
}
export function chromeClockNeedsAnchor(now:number,lastAt:number,position:number,lastPosition:number,playing:boolean):boolean {
    if(!Number.isFinite(position))return false;
    const expected=lastPosition+(playing?(now-lastAt)/1000:0);
    return now-lastAt>=2000||Math.abs(position-expected)>.65;
}
export function chromeWindowInteraction(phase:'start'|'end') {
    // Existing chrome auto-hide owns visibility. Native gestures report only their endpoints.
    window.dispatchEvent(new Event(phase==='start'?'pointerdown':'pointerup'));
    window.dispatchEvent(new CustomEvent('tingyu-native-chrome-interaction',{detail:{held:phase==='start'}}));
}

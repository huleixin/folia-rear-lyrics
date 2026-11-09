import {useSyncExternalStore} from 'react';
import {setVisualizerLowPower,setVisualizerRenderingSuspended,invalidateVisualizerLowPower} from '../utils/visualizerFrameChannel';

// src/services/rearAodRuntime.ts
// Rendering demand only; never writes the saved appearance or playback clock.
let aod=false;
export type RearRenderMode='NORMAL'|'AOD'|'HIDDEN';
export type RearModeReceipt={mode:RearRenderMode;sequence:number};
let receipt:RearModeReceipt={mode:'NORMAL',sequence:-1};
export const getRearModeReceipt=()=>receipt;
/** LSP-only rendering state. Hidden retains the prior AOD budget and resumes with one invalidation. */
export function applyRearMode(value:unknown):boolean{
    const next=value as Partial<RearModeReceipt>|null;
    if(!next||!['NORMAL','AOD','HIDDEN'].includes(next.mode??''))return false;
    const sequence=next.sequence??receipt.sequence+1;
    if(!Number.isSafeInteger(sequence)||sequence<receipt.sequence)return false;
    if(sequence===receipt.sequence&&next.mode!==receipt.mode)return false;
    const previous=receipt;
    receipt={mode:next.mode as RearRenderMode,sequence};
    const sleeping=receipt.mode==='HIDDEN';
    (window as Window&{__tingyuRearSleeping?:boolean}).__tingyuRearSleeping=sleeping;
    if((previous.mode==='HIDDEN')!==sleeping)
        window.dispatchEvent(new CustomEvent('folia-rear-power',{detail:{sleeping}}));
    if(receipt.mode==='HIDDEN')setVisualizerRenderingSuspended(true);
    else{
        setRearAod(receipt.mode==='AOD');
        setVisualizerRenderingSuspended(false);
        if(previous.mode==='HIDDEN'||previous.mode!==receipt.mode||previous.sequence!==sequence)invalidateVisualizerLowPower();
    }
    document.documentElement.dataset.rearMode=receipt.mode;
    (window as Window&{__foliaRearModeReceipt?:RearModeReceipt}).__foliaRearModeReceipt=receipt;
    return true;
}
const listeners=new Set<()=>void>();
export const isRearAod=()=>aod;
export function setRearAod(value:boolean){
    if(aod===value)return;
    aod=value;setVisualizerLowPower(value);
    document.documentElement.dataset.rearAod=String(value);
    for(const listener of listeners)listener();
}
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)};};
export const useRearAod=()=>useSyncExternalStore(subscribe,isRearAod,()=>false);

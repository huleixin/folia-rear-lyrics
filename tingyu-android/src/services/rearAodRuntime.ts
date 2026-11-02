import {useSyncExternalStore} from 'react';
import {setVisualizerLowPower} from '../utils/visualizerFrameChannel';

// src/services/rearAodRuntime.ts
// Rendering demand only; never writes the saved appearance or playback clock.
let aod=false;
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

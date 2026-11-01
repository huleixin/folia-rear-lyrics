import { getTingyuPlayback } from '../platform/tingyuPlayback';
import { useSleepTimerStore } from '../stores/useSleepTimerStore';
import {usePlaybackStore} from '../stores/usePlaybackStore';
import { setStatusMessage } from '../stores/useStatusMessageStore';

// src/services/nativeSleepTimer.ts
export type SleepMode='deadline'|'track'|'deadline_track';
interface State {sample?:number;generation:number;active:boolean;mode:SleepMode;waiting:boolean;durationMs:number;remainingMs:number;reason:string}
interface Bridge {startSleepTimer(o:{mode:SleepMode;durationMs:number}):Promise<State>;cancelSleepTimer():Promise<State>;getSleepTimerState():Promise<State>;addListener(name:string,fn:(s:State)=>void):Promise<{remove():Promise<void>}>}
let serial:Promise<unknown>=Promise.resolve(),generation=-1,request=0,completedGeneration=-1,lastSample=-1;
export function applySleepState(s:State){
    if(s.generation<generation||(s.generation===generation&&s.sample!==undefined&&s.sample<lastSample))return;
    if(s.generation>generation)lastSample=-1;generation=s.generation;lastSample=s.sample??lastSample;
    useSleepTimerStore.setState({sleepTimerEnabled:s.active,sleepTimerMode:s.mode,sleepTimerWaiting:s.waiting,
        sleepTimerDeadlineMs:s.active&&!s.waiting?Date.now()+s.remainingMs:null,sleepTimerRemainingMs:s.remainingMs,sleepTimerDurationMs:s.durationMs,
        sleepTimerAnchor:performance.now()});
    if(s.reason==='completed'&&completedGeneration!==s.generation){completedGeneration=s.generation;setStatusMessage({type:'info',text:'定时结束，已暂停音乐'});}
}
export function nativeSleepAction(enable:boolean,mode?:SleepMode,durationMs?:number){
    const ticket=++request,s=useSleepTimerStore.getState();
    serial=serial.catch(()=>{}).then(async()=>{
        const native=getTingyuPlayback<Bridge>();
        const state=enable?await native.startSleepTimer({mode:mode??s.sleepTimerMode,durationMs:durationMs??(s.sleepTimerHours*60+s.sleepTimerMinutes)*60000}):await native.cancelSleepTimer();
        if(ticket===request)applySleepState(state);
    }).catch(()=>setStatusMessage({type:'error',text:'定时未设置，请确认歌曲已在系统原生引擎中加载'}));
    return serial;
}
export async function installNativeSleepTimer(){
    const native=getTingyuPlayback<Bridge>();let live=true;
    const read=()=>{const ticket=request;void native.getSleepTimerState().then(s=>{if(live&&ticket===request)applySleepState(s);}).catch(()=>{});};
    const subscription=await native.addListener('sleepTimerStateChanged',s=>{if(live)applySleepState(s);});
    let hadQueue=usePlaybackStore.getState().playQueue.length>0;
    const unsubscribe=usePlaybackStore.subscribe(state=>{const hasQueue=state.playQueue.length>0;if(hadQueue&&!hasQueue)void nativeSleepAction(false);hadQueue=hasQueue;});
    const visible=()=>{if(document.visibilityState==='visible')read();};document.addEventListener('visibilitychange',visible);read();
    return()=>{unsubscribe();live=false;document.removeEventListener('visibilitychange',visible);void subscription.remove();};
}

export async function refreshNativeSleepTimer(){
    const ticket=request;try{const state=await getTingyuPlayback<Bridge>().getSleepTimerState();if(ticket===request)applySleepState(state);}catch{}
}

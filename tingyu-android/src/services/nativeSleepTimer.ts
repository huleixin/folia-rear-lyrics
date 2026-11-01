import { getTingyuPlayback } from '../platform/tingyuPlayback';
import { useSleepTimerStore } from '../stores/useSleepTimerStore';
import {usePlaybackStore} from '../stores/usePlaybackStore';
import { setStatusMessage } from '../stores/useStatusMessageStore';

// src/services/nativeSleepTimer.ts
export type SleepMode='deadline'|'track'|'deadline_track';
interface State {sample?:number;generation:number;active:boolean;mode:SleepMode;waiting:boolean;durationMs:number;remainingMs:number;reason:string;pausePending?:boolean}
interface Bridge {startSleepTimer(o:{mode:SleepMode;durationMs:number}):Promise<State>;cancelSleepTimer():Promise<State>;getSleepTimerState():Promise<State>;addListener(name:string,fn:(s:State)=>void):Promise<{remove():Promise<void>}>}
let serial:Promise<unknown>=Promise.resolve(),generation=-1,request=0,completedGeneration=-1,lastSample=-1;
export function applySleepState(s:State){
    if(s.generation<generation||(s.generation===generation&&s.sample!==undefined&&s.sample<lastSample))return;
    const changedTask=s.generation>generation;
    if(changedTask)lastSample=-1;generation=s.generation;lastSample=s.sample??lastSample;
    if(changedTask&&s.active&&!s.waiting&&s.reason==='started'&&s.durationMs>0)
        useSleepTimerStore.getState().handleSetSleepTimerDurationMinutes(Math.round(s.durationMs/60000));
    useSleepTimerStore.setState({sleepTimerEnabled:s.active,sleepTimerMode:s.mode,sleepTimerWaiting:s.waiting,
        sleepTimerDeadlineMs:s.active&&!s.waiting?Date.now()+s.remainingMs:null,sleepTimerRemainingMs:s.remainingMs,sleepTimerDurationMs:s.durationMs,
        sleepTimerAnchor:performance.now()});
    if(s.reason==='completed'&&completedGeneration!==s.generation){completedGeneration=s.generation;setStatusMessage({type:'info',text:'定时结束，已暂停音乐'});}
    if(s.reason==='pause-unconfirmed')setStatusMessage({type:'error',text:'定时已到，但兼容播放尚未确认暂停；返回应用后会重试，请检查声音是否停止'});
}
export function nativeSleepAction(enable:boolean,mode?:SleepMode,durationMs?:number){
    const ticket=++request,s=useSleepTimerStore.getState();
    serial=serial.catch(()=>{}).then(async()=>{
        const native=getTingyuPlayback<Bridge>();
        const state=enable?await native.startSleepTimer({mode:mode??s.sleepTimerMode,durationMs:durationMs??(s.sleepTimerHours*60+s.sleepTimerMinutes)*60000}):await native.cancelSleepTimer();
        if(ticket===request)applySleepState(state);
    }).catch(()=>setStatusMessage({type:'error',text:'定时未设置，请等待当前播放通道就绪后重试'}));
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

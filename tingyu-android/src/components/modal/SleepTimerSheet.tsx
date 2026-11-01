import React, {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,Timer} from 'lucide-react';
import {useSleepTimerStore} from '../../stores/useSleepTimerStore';
import {nativeSleepAction,refreshNativeSleepTimer,type SleepMode} from '../../services/nativeSleepTimer';
import './sleepTimerSheet.css';

// src/components/modal/SleepTimerSheet.tsx
const modes:Array<[SleepMode,string]>=[['deadline','时间结束立即暂停'],['track','当前歌曲播放完暂停'],['deadline_track','时间结束后播完当前歌曲再暂停']];
export default function SleepTimerSheet(){
 const s=useSleepTimerStore(),[mode,setMode]=useState(s.sleepTimerMode),[minutes,setMinutes]=useState(s.sleepTimerHours*60+s.sleepTimerMinutes||30),[custom,setCustom]=useState(false),[now,setNow]=useState(performance.now()),[busy,setBusy]=useState(false);
 const close=()=>useSleepTimerStore.setState({sleepTimerSheetOpen:false});
 useEffect(()=>{void refreshNativeSleepTimer();const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const esc=(e:KeyboardEvent)=>{if(e.key==='Tab'){const nodes=[...document.querySelectorAll<HTMLElement>('.sleep-sheet button:not(:disabled),.sleep-sheet input')];const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}};document.addEventListener('keydown',esc,true);
  document.querySelector<HTMLButtonElement>('.sleep-sheet button')?.focus();
  return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',esc,true);previous?.focus();};},[]);
 useEffect(()=>{let timer:ReturnType<typeof setInterval>|undefined;const refresh=()=>{clearInterval(timer);if(document.visibilityState==='visible'){setNow(performance.now());timer=setInterval(()=>setNow(performance.now()),1000);}};refresh();document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};},[]);
 const remaining=Math.max(0,s.sleepTimerRemainingMs-(now-s.sleepTimerAnchor)),seconds=Math.ceil(remaining/1000),time=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
 const run=async(enable:boolean)=>{setBusy(true);try{if(enable){s.handleSetSleepTimerHours(Math.floor(minutes/60));s.handleSetSleepTimerMinutes(minutes%60);}await nativeSleepAction(enable,mode,minutes*60000);}finally{setBusy(false);}};
 return createPortal(<div className="sleep-scrim" data-native-chrome-overlay="blocking" onPointerDown={e=>{if(e.target===e.currentTarget)close();}}>
 <section data-folia-keyboard-window="true" role="dialog" aria-modal="true" aria-labelledby="sleep-title" className="sleep-sheet">
  <header><div><h2 id="sleep-title"><Timer size={21}/>定时关闭</h2><p>让音乐陪你慢慢入睡</p></div><button aria-label="关闭" onClick={close}><X size={22}/></button></header>
  {s.sleepTimerEnabled&&<div className="sleep-running"><strong>{s.sleepTimerWaiting?'等待本曲结束':time}</strong><p>{modes.find(([key])=>key===s.sleepTimerMode)?.[1]}</p>{!s.sleepTimerWaiting&&<progress aria-label="剩余时间" max={Math.max(1,s.sleepTimerDurationMs)} value={Math.min(s.sleepTimerDurationMs,remaining)}/>}<button disabled={busy} onClick={()=>void run(false)}>取消定时</button></div>}
  <div className="sleep-modes">{modes.map(([key,label])=><button key={key} role="radio" aria-checked={mode===key} onClick={()=>setMode(key)}>{label}<span>{mode===key?'●':'○'}</span></button>)}</div>
  {mode!=='track'&&<><div className="sleep-presets">{[15,30,45,60,90].map(n=><button key={n} aria-pressed={!custom&&minutes===n} onClick={()=>{setMinutes(n);setCustom(false);}}>{n} 分钟</button>)}<button aria-pressed={custom} onClick={()=>setCustom(true)}>自定义</button></div>
   {custom&&<div className="sleep-custom"><label>小时<input aria-label="小时" type="number" min="0" max="23" value={Math.floor(minutes/60)} onChange={e=>setMinutes(Math.min(23,Math.max(0,Number(e.target.value)||0))*60+minutes%60)}/></label><label>分钟<input aria-label="分钟" type="number" min="0" max="59" value={minutes%60} onChange={e=>setMinutes(Math.floor(minutes/60)*60+Math.min(59,Math.max(0,Number(e.target.value)||0)))}/></label></div>}</>}
  <button className="sleep-start" disabled={busy||(mode!=='track'&&minutes<1)} onClick={()=>void run(true)}>{s.sleepTimerEnabled?'按新设置重新定时':'开始定时'}</button>
 </section></div>,document.body);
}

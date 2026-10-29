import { registerPlugin } from '@capacitor/core';
import { GRAPHICS_DIAGNOSTICS, type GraphicsMode } from '../utils/graphicsDiagnosticsBuild';
import { isMainAppSurface } from '../utils/appSurface';
import { useAppViewStore } from '../stores/useAppViewStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { currentTime, lyricCurrentTime } from '../stores/motionSignals';
import { exportDiagnosticReport } from './exportDiagnosticReport';
import { readPlaybackTestLog } from './playbackTestLog';
import { getTingyuPlayback } from '../platform/tingyuPlayback';

// src/services/graphicsDiagnostics.ts
// No pixel readback, mutation observer, RAF, per-frame state, or continuous disk writes.
type NativeSnapshot=Record<string,unknown>&{mode:GraphicsMode};
export const graphicsPort=registerPlugin<{
    graphicsProbe():Promise<NativeSnapshot>;
    graphicsConfigure(value:{mode:GraphicsMode}):Promise<{saved:boolean}>;
    addListener(name:'graphicsMark',listener:(value:NativeSnapshot)=>void):Promise<{remove():Promise<void>}>;
}>('TingyuChrome');
type StageState={mode:string;seed?:string|number;line:number;paused?:boolean;staticMode?:boolean;clock:number};
type Entry={at:number;kind:string;data:unknown};
type Run={id:string;mode:string;startedAt:number;stoppedAt?:number;observation?:string;entries:Entry[]};
const KEY='tingyu_graphics_runs_v1',LIMIT=180;
let run:Run|null=null,timer=0,deadline=0,installed=false,busy=false;
let lifecycle:Entry[]=[],serial=0;
const stages=new Map<number,()=>StageState>();
const shells=new Set<number>();
const note=(kind:string,data:unknown)=>{
    if(!GRAPHICS_DIAGNOSTICS||!isMainAppSurface)return;
    const entry={at:Date.now(),kind,data};
    lifecycle.push(entry);if(lifecycle.length>24)lifecycle.shift();
    if(run){run.entries.push(entry);if(run.entries.length>LIMIT)run.entries.shift();}
};
export function graphicsStageMounted(read:()=>StageState){
    const id=++serial;stages.set(id,read);note('react-mount',{id,...read()});
    return()=>{stages.delete(id);note('react-unmount',{id})};
}
export function graphicsShellMounted(){
    const id=++serial;shells.add(id);note('shell-mount',{id});
    return()=>{shells.delete(id);note('shell-unmount',{id})};
}
function styleOf(node:Element|null){
    if(!node)return {exists:false};const css=getComputedStyle(node),rect=node.getBoundingClientRect();
    return {exists:true,connected:node.isConnected,display:css.display,visibility:css.visibility,opacity:css.opacity,
        width:Math.round(rect.width),height:Math.round(rect.height),contentVisibility:css.contentVisibility};
}
export function graphicsWebSnapshot(){
    const root=document.querySelector('[data-testid="player-visual-surface"]');
    const shell=root?.querySelector('[data-graphics-shell]')??null;
    const words=shell?[...shell.querySelectorAll('[data-lyric-phase]')]:[];
    return {route:useAppViewStore.getState().view,documentVisibility:document.visibilityState,
        root:styleOf(root),shell:styleOf(shell),marker:styleOf(document.getElementById('tingyu-web-marker')),
        rendererMounted:stages.size>0,shellInstances:[...shells],instances:[...stages].map(([id,read])=>({id,...read()})),
        clocks:{playback:currentTime.get(),lyrics:lyricCurrentTime.get()},playerState:usePlaybackStore.getState().playerState,
        viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
        renderNodes:{words:words.length,canvases:shell?.querySelectorAll('canvas').length??0},
        words:words.filter(n=>n.getAttribute('data-lyric-phase')==='active').concat(words.filter(n=>n.getAttribute('data-lyric-phase')==='passed').slice(-4))
            .slice(0,8).map(node=>({text:node.textContent?.slice(0,18),phase:node.getAttribute('data-lyric-phase'),start:node.getAttribute('data-lyric-start'),...styleOf(node)}))};
}
export async function sampleGraphics(kind='sample',nativeMark?:NativeSnapshot){
    if(!GRAPHICS_DIAGNOSTICS||!isMainAppSurface)return;
    if(busy){if(kind.endsWith('mark'))note(kind,{native:nativeMark??null,webDeferred:true});return;}
    busy=true;const at=Date.now();let timeout=0;
    try{
        const web=graphicsWebSnapshot();
        const native=nativeMark??await Promise.race([graphicsPort.graphicsProbe(),new Promise<NativeSnapshot>((_,reject)=>{timeout=window.setTimeout(()=>reject(Error('native probe timeout')),1500)})]);
        note(kind,{requestedAt:at,native,web});
    }catch(error){note('probe-error',{requestedAt:at,message:String(error)})}finally{clearTimeout(timeout);busy=false;}
}
function savedRuns():Run[]{try{const value=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(value)?value.slice(-8):[]}catch{return[]}}
export function stopGraphicsRun(observation?:string){
    clearInterval(timer);clearTimeout(deadline);timer=0;deadline=0;
    if(!run)return;run.stoppedAt=Date.now();if(observation)run.observation=observation;
    try{localStorage.setItem(KEY,JSON.stringify([...savedRuns(),run].slice(-8)))}catch{}
    run=null;
}
export async function startGraphicsRun(){
    if(!GRAPHICS_DIAGNOSTICS)return;stopGraphicsRun();
    const state=await graphicsPort.graphicsProbe();
    run={id:crypto.randomUUID(),mode:state.mode,startedAt:Date.now(),entries:lifecycle.slice()};
    await sampleGraphics('start');
    timer=window.setInterval(()=>{if(document.visibilityState==='visible'&&useAppViewStore.getState().view==='player')void sampleGraphics()},1000);
    deadline=window.setTimeout(()=>stopGraphicsRun(),90000);
}
export function installGraphicsDiagnostics(){
    if(!GRAPHICS_DIAGNOSTICS||!isMainAppSurface||installed)return()=>{};installed=true;
    const marker=document.createElement('button');marker.id='tingyu-web-marker';marker.textContent='W · 记闪烁';
    marker.setAttribute('aria-label','WebView 固定标记，点击记录闪烁');
    Object.assign(marker.style,{position:'fixed',left:'100px',top:'calc(var(--folia-main-inset-top, 0px) + 3px)',zIndex:'2147483647',
        color:'#fff2a6',background:'#27220bea',font:'10px sans-serif',padding:'3px 5px',border:'0',borderRadius:'0',animation:'none',transition:'none'});
    marker.onclick=event=>{event.stopPropagation();void sampleGraphics('web-mark')};document.body.append(marker);
    let removed=false,listener:{remove():Promise<void>}|undefined;
    void graphicsPort.addListener('graphicsMark',value=>void sampleGraphics('native-mark',value)).then(value=>{listener=value;if(removed)void value.remove()}).catch(()=>{});
    return()=>{removed=true;installed=false;marker.remove();void listener?.remove();stopGraphicsRun()};
}
export async function applyGraphicsMode(mode:GraphicsMode){
    stopGraphicsRun();
    document.querySelectorAll('audio').forEach(element=>element.pause());
    await graphicsPort.graphicsConfigure({mode});
}
export async function exportGraphicsReport(observation=''){
    if(!GRAPHICS_DIAGNOSTICS)throw Error('Graphics diagnostic build required');
    if(run)stopGraphicsRun(observation);
    else if(observation){const runs=savedRuns();if(runs.length){runs[runs.length-1].observation=observation;localStorage.setItem(KEY,JSON.stringify(runs));}}
    const native=await graphicsPort.graphicsProbe().catch(error=>({error:String(error)}));
    let audioNative:unknown;let timeout=0;
    try{audioNative=await Promise.race([getTingyuPlayback<{diagnostics():Promise<unknown>}>().diagnostics(),new Promise((_,reject)=>{timeout=window.setTimeout(()=>reject(Error('audio diagnostics timeout')),3000)})])}
    catch(error){audioNative={unavailable:String(error)}}finally{clearTimeout(timeout)}
    const report={format:'tingyu-graphics-isolation-v1',createdAt:new Date().toISOString(),native,web:graphicsWebSnapshot(),runs:savedRuns(),audio:readPlaybackTestLog(),audioNative,
        limitations:['View/Compose counters do not prove physical GPU allocation/recreation.','Marker disappearance must be correlated with the device screen recording.','C31/A reproduce rendering strategies; they are not an executed comparison of historical APK binaries.']};
    return exportDiagnosticReport(JSON.stringify(report,null,2),'听屿歌词闪烁对照日志');
}

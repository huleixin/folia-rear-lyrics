import { PLAYBACK_TEST_BUILD, PLAYBACK_TEST_SESSION_ENGINE } from '../utils/playbackEngineTestBuild';
import { GRAPHICS_DIAGNOSTICS } from '../utils/graphicsDiagnosticsBuild';

// src/services/playbackTestLog.ts
const KEY='tingyu_playback_test_log_v1', LIMIT=100;
const enabled=PLAYBACK_TEST_BUILD||GRAPHICS_DIAGNOSTICS;
type Entry={at:string;session:string;event:string;details:Record<string,string|number|boolean>};
const session=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
let entries:Entry[]=[],timer:ReturnType<typeof setTimeout>|undefined;
export const redactPlaybackTestText=(value:unknown):string=>String(value??'')
    .replace(/(?:https?|file|content):\/\/[^\s"'<>]+/gi,'[uri]')
    .replace(/\/(?:storage|sdcard|data|mnt)\/[^\s"'<>]+/gi,'[path]')
    .replace(/(authorization|cookie)\s*[:=]\s*[^\r\n]+/gi,'$1=[redacted]')
    .replace(/(token|cookie|authorization|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,'$1=[redacted]').slice(0,320);
try { if(enabled){const saved=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(saved))entries=saved.slice(-LIMIT);} }catch{}
const persist=()=>{timer=undefined;try{localStorage.setItem(KEY,JSON.stringify(entries));}catch{}};
export function notePlaybackTest(event:string,details:Record<string,unknown>={}){
    if(!enabled)return;
    const safe:Entry['details']={};
    for(const [key,value] of Object.entries(details))safe[key]=typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)?value:redactPlaybackTestText(value);
    entries.push({at:new Date().toISOString(),session,event,details:safe});entries=entries.slice(-LIMIT);
    if(/error|fail|timeout|switch/.test(event)){clearTimeout(timer);persist();}else if(!timer)timer=setTimeout(persist,700);
}
export function playbackTestUriInfo(uri:string){
    try{const u=new URL(uri);return {scheme:u.protocol,host:u.hostname};}catch{return{scheme:'unknown',host:''};}
}
export function readPlaybackTestLog(){return entries.map(entry=>({...entry,details:{...entry.details}}));}
let installed=false;
export function installPlaybackTestMediaLog(){
    if(!enabled||installed)return;installed=true;
    notePlaybackTest('session-start',{selected:PLAYBACK_TEST_SESSION_ENGINE});
    for(const event of ['loadstart','loadedmetadata','canplay','play','playing','pause','waiting','stalled','seeking','seeked','ended','error']){
        document.addEventListener(event,record=>{const audio=record.target;if(!(audio instanceof HTMLMediaElement))return;
            notePlaybackTest(`media-${event}`,{...playbackTestUriInfo(audio.currentSrc||audio.getAttribute('src')||''),
                position:audio.currentTime,duration:audio.duration,paused:audio.paused,ready:audio.readyState,
                muted:audio.muted,volume:audio.volume,errorCode:audio.error?.code??0,error:audio.error?.message??''});
        },true);
    }
}

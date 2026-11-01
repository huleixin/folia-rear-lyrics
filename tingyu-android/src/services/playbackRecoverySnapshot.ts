import { isCapacitorAndroid } from '../platform/runtime';
import { getTingyuPlayback } from '../platform/tingyuPlayback';
import { getPlaybackSongKey, isStagePlaybackSong, normalizePlaybackSongSource } from '../utils/appPlaybackGuards';
import type { SongResult } from '../types';

// src/services/playbackRecoverySnapshot.ts
export interface QueueSnapshot {
    v: 1; capturedAt?:number; queue: Array<{songKey:string;song:SongResult}>; order:string[];
    loopMode?:'off'|'all'|'one'; currentKey:string; positionMs:number; mode:'off'|'all'|'one'|'shuffle'; origin:unknown; cleared:boolean;
}
export interface RecoveryReply {
    status:string; revision:number; snapshot?:QueueSnapshot;
    live?:{songKey:string;uri:string;position:number;paused:boolean;duration:number};
    liveTrack?:Record<string,unknown>; liveMode?:string; liveLoopAll?:boolean;
}
interface Bridge {
    readPlaybackRecovery():Promise<RecoveryReply>;
    savePlaybackRecovery(o:{snapshot:QueueSnapshot;revision:number}):Promise<{revision:number}>;
    checkpointPlaybackRecovery(o:{songKey:string;positionMs:number;mode:string}):Promise<void>;
}
let ready=false,revision=0;
let baseline:{queue:SongResult[];key:string;mode:string}|null=null;
let serial:Promise<unknown>=Promise.resolve();
let savedSignature='',request=0;
let restoredOrigin:{keys:Set<string>;origin:unknown}|null=null;
export const recoveryOrigin=(key:string):unknown=>restoredOrigin?.keys.has(key)?restoredOrigin.origin:null;
export const recoveryReady=()=>!isCapacitorAndroid()||ready;
export const finishRecovery=(reply:RecoveryReply)=>{revision=reply.revision;ready=true;
    restoredOrigin=reply.snapshot?{keys:new Set(reply.snapshot.queue.map(row=>row.songKey)),origin:reply.snapshot.origin}:null;
    if(typeof window!=='undefined')window.dispatchEvent(new Event('tingyu-playback-recovery-ready'));};
export const holdLiveQueue=(queue:SongResult[],key:string,mode:string)=>{baseline={queue,key,mode};};
export const keepLiveQueue=(queue:SongResult[],key:string,mode:string)=>{
    if(!baseline)return false;
    if(baseline.queue===queue&&baseline.key===key&&baseline.mode===mode)return true;
    baseline=null;return false;
};
export const readPlaybackRecovery=async():Promise<RecoveryReply|null>=>{
    if(!isCapacitorAndroid())return null;
    return getTingyuPlayback<Bridge>().readPlaybackRecovery();
};
/** Keep identity and stable metadata; exclude transport URLs, credentials and resource payloads. */
export const sanitizeRecoverySong=(song:SongResult):SongResult=>{
    song=normalizePlaybackSongSource(song);
    const fields=['id','name','artists','artist','album','durationMs','sourceRef','localRef','isLocal','isNavidrome','navidromeData','qqMid','hash','catalogAudioSpecs','sourceType','t'];
    const clean=(value:unknown):unknown=>{
        if(Array.isArray(value))return value.map(clean);
        if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>
            !/^(url|uri|audioSrc|audioUrl|streamUrl|playUrl|playbackUrl|downloadUrl|cookie|token|password|authorization|lyrics|onlineLyricsState)$/i.test(key)
        ).map(([key,value])=>[key,clean(value)]));
        return value;
    };
    return clean(Object.fromEntries(fields.filter(key=>key in song).map(key=>[key,(song as unknown as Record<string,unknown>)[key]]))) as SongResult;
};
export const createQueueSnapshot=(song:SongResult|null,queue:SongResult[],mode:QueueSnapshot['mode'],order:string[],positionMs=0,origin:unknown=null,loopMode:'off'|'all'|'one'=mode==='shuffle'?'all':mode):QueueSnapshot=>{
    const seen=new Set<string>();
    const rows=queue.filter(item=>!isStagePlaybackSong(item)).flatMap(item=>{
        const key=getPlaybackSongKey(item);if(!key||seen.has(key))return[];seen.add(key);
        return[{songKey:key,song:sanitizeRecoverySong(item)}];
    });
    const currentKey=song?getPlaybackSongKey(song):'';
    const cleared=rows.length===0||!song;
    if(!cleared&&!seen.has(currentKey)){rows.unshift({songKey:currentKey,song:sanitizeRecoverySong(song!)});seen.add(currentKey);}
    const ordered=[...new Set([...order,...rows.map(row=>row.songKey)])].filter(key=>seen.has(key));
    return{v:1,loopMode,queue:cleared?[]:rows,order:cleared?[]:ordered,currentKey:cleared?'':currentKey,
        positionMs:Number.isFinite(positionMs)?Math.max(0,Math.round(positionMs)):0,mode,origin,cleared};
};
export const saveRecoverySnapshot=(snapshot:QueueSnapshot):Promise<unknown>=>{
    if(!isCapacitorAndroid()||!ready)return Promise.resolve();
    // No position in this signature: clock checkpoints never serialize the full queue.
    const signature=JSON.stringify({...snapshot,positionMs:0,capturedAt:0}),ticket=++request;
    serial=serial.catch(()=>{}).then(async()=>{
        if(ticket!==request||signature===savedSignature)return;
        const native=getTingyuPlayback<Bridge>();
        try{const result=await native.savePlaybackRecovery({snapshot:{...snapshot,capturedAt:Date.now()},revision});revision=result.revision;savedSignature=signature;}
        catch{const current=await native.readPlaybackRecovery();revision=current.revision;throw Error('Queue save rejected; retained last valid native session');}
    });
    return serial;
};
export const checkpointRecovery=(songKey:string,positionMs:number,mode:string):Promise<void>=>{
    if(!recoveryReady()||!isCapacitorAndroid())return Promise.resolve();
    return getTingyuPlayback<Bridge>().checkpointPlaybackRecovery({songKey,positionMs,mode});
};

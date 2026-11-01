import type { SongResult } from '../types';
import { getPlaybackSongKey, getPlaybackSourceRef, isStagePlaybackSong, normalizePlaybackSongSource } from '../utils/appPlaybackGuards';
import type { RecoveryReply, QueueSnapshot } from './playbackRecoverySnapshot';

// src/services/androidSessionRecovery.ts
let presentationKey='';
export const armRecoveryPresentation=(key:string)=>{presentationKey=key;};
export const consumeRecoveryPresentation=(key:string)=>{const matches=key===presentationKey;presentationKey='';return matches;};
let pending:{key:string;ms:number;consumed:()=>void}|null=null;
export const armRecoveryPosition=(key:string,ms:number,consumed:()=>void)=>{pending={key,ms,consumed};armRecoveryPresentation(key);};
export const consumeRecoveryPosition=(key:string):number|null=>{
    if(!pending||pending.key!==key)return null;
    const value=pending;pending=null;value.consumed();return value.ms;
};
export const hasPendingColdRecovery=()=>pending!==null;
export const discardRecoveryPosition=(key:string)=>{if(pending&&pending.key!==key)pending=null;};
export const recoveryMode=(value:string):QueueSnapshot['mode']=>['off','all','one','shuffle'].includes(value)?value as QueueSnapshot['mode']:'off';
export const chooseRecoveryPlan=(reply:RecoveryReply,legacy:{song:SongResult|null;queue:SongResult[]}={song:null,queue:[]})=>{
    const live=reply.live;
    if(!live && ['cleared','stopped','corrupt','unsupported'].includes(reply.status))return null;
    const snapshot=reply.snapshot;
    const rows=snapshot?.queue??(!snapshot&&reply.status==='empty'?legacy.queue.map(song=>({songKey:getPlaybackSongKey(song),song})):[]);
    const unique=new Map<string,SongResult>();
    for(const row of rows){
        if(!row?.song||typeof row.song!=='object')continue;
        try{
            const song=normalizePlaybackSongSource(row.song),ref=getPlaybackSourceRef(song);
            if(isStagePlaybackSong(song)||!ref.mediaId||String(ref.mediaId)==='undefined'||(ref.kind==='online'&&!ref.providerId))continue;
            const key=getPlaybackSongKey(song);
            if(key===row.songKey&&!unique.has(key))unique.set(key,{
                ...song,id:song.id??ref.mediaId,name:typeof song.name==='string'?song.name:'',
                artists:Array.isArray(song.artists)?song.artists:[],album:song.album&&typeof song.album==='object'?song.album:{id:'',name:''},
            });
        }catch{}
    }
    const key=live?.songKey??snapshot?.currentKey??(legacy.song?getPlaybackSongKey(legacy.song):'');
    let song=unique.get(key)??null;
    if(!song&&live){
        const tag=reply.liveTrack??{};
        const match=/^online:([^:]+):(.+)$/.exec(key);
        const providerId=String(tag.providerId??match?.[1]??'');
        const other=/^(local|navidrome):(.+)$/.exec(key);
        const mediaId=String(tag.mediaId||match?.[2]||other?.[2]||'');
        song={id:mediaId||key,name:String(tag.title??''),durationMs:Math.max(0,Number(tag.durationMs??live.duration*1000)||0),
            artists:[{name:String(tag.artist??'')}],album:{name:String(tag.album??''),coverUrl:String(tag.artwork??tag.coverUrl??'')},
            ...(other?{sourceRef:{kind:other[1],mediaId},...(other[1]==='local'?{isLocal:true,localRef:{songId:mediaId}}:{isNavidrome:true,navidromeData:{isNavidrome:true,navidromeData:{id:mediaId}}})}:{}),
            ...(providerId?{sourceRef:{kind:'online',providerId,mediaId,providerData:tag.providerData}}:{}),
        } as SongResult;
        if(reply.status!=='cleared')unique.set(key,song);
    }
    if(!song&&reply.status==='empty'&&legacy.song){song=normalizePlaybackSongSource(legacy.song);unique.set(getPlaybackSongKey(song),song);}
    if(!song)song=unique.values().next().value??null;
    if(!song)return null;
    const effectiveKey=live?.songKey??getPlaybackSongKey(song);
    const rawPosition=live?live.position*1000:effectiveKey===snapshot?.currentKey?snapshot.positionMs:0;
    const positionMs=Number.isFinite(rawPosition)?Math.max(0,rawPosition):0;
    const order=[...new Set([...(snapshot?.order??[]),...unique.keys()])].filter(value=>unique.has(value));
    const storedLoop=snapshot?.loopMode;
    const loopMode=live&&reply.liveLoopAll!==undefined?(reply.liveLoopAll?'all':'off'):storedLoop&&['all','one','off'].includes(storedLoop)?storedLoop:undefined;
    return{loopMode,song,queue:[...unique.values()],order,positionMs,mode:recoveryMode(reply.liveMode??snapshot?.mode??'off'),live};
};

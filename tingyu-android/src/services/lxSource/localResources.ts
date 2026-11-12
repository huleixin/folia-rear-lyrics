import type { SongResult, LyricData } from '../../types';
import { createProviderSongMetadata } from '../../utils/songMetadata';
import { useLxSourceStore } from '../../stores/useLxSourceStore';
import { parseLyricsAsync } from '../../utils/lyrics/workerClient';
import { withLxRuntime } from './session';
import { validateRemoteUrl } from './contract';
import { noteLx, classifyLx } from './diagnostics';

// src/services/lxSource/localResources.ts
/** Optional fallback for local files. No file path, file bytes, or application credentials leave the host. */
export async function resolveLxLocalResources(song:SongResult,needs:{lyric:boolean;pic:boolean}):Promise<{lyrics:LyricData|null;coverUrl:string|null}> {
    const empty={lyrics:null,coverUrl:null};
    const state=useLxSourceStore.getState(),script=state.scripts.find(s=>s.id===state.activeId);
    if(!script?.capabilities.local || !needs.lyric&&!needs.pic)return empty;
    try{return await withLxRuntime(async(active,_state,current)=>{
        const caps=await active.ready;current();const actions=caps.local?.actions??[];
        const metadata=createProviderSongMetadata(song),seconds=Math.round(metadata.durationMs/1000);
        const musicInfo={id:String(song.id),source:'local',name:song.name,singer:metadata.artists.map(a=>a.name).join('、'),interval:`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`,meta:{albumName:metadata.album.name}};
        let lyrics:LyricData|null=null,coverUrl:string|null=null;
        if(needs.lyric&&actions.includes('lyric')){
            try{
                const value=await active.request({source:'local',action:'lyric',info:{musicInfo}}) as {lyric?:string;tlyric?:string;rlyric?:string;lxlyric?:string};current();
                if(typeof value?.lyric==='string')lyrics=await parseLyricsAsync(value.lxlyric?'awlrc':'lrc',value.lxlyric||value.lyric,value.tlyric||undefined,undefined,value.rlyric||undefined);
            }catch(error){noteLx('local-lyric',classifyLx(error),error);}
        }
        if(needs.pic&&actions.includes('pic')){
            try{const value=await active.request({source:'local',action:'pic',info:{musicInfo}});current();if(typeof value==='string')coverUrl=validateRemoteUrl(value);}catch(error){noteLx('local-pic',classifyLx(error),error);}
        }
        current();return {lyrics,coverUrl};
    })??empty;}catch(error){noteLx('local-resource',classifyLx(error),error);return empty;}
}

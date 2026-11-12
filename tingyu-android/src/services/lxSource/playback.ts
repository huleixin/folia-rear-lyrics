import type { SongResult } from '../../types';
import { OnlineProviderError, type AudioQualityPreference, type OmniAudioSource } from '../../types/onlineMusic';
import { getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { noteOnlinePlaybackOutcome } from '../../utils/onlinePlaybackDiagnostics';
import { lxQualityAttempts, LX_QUALITIES, validateRemoteUrl } from './contract';
import { prepareLxAudio } from './media';
import { lxPlatformFor } from './selection';
import { matchLxCatalogSong } from './catalogMatch';
import { buildLxMusicInfo } from './musicInfo';
import { withLxRuntime } from './session';
import { classifyLx, noteLx, redactLx } from './diagnostics';

// src/services/lxSource/playback.ts
export async function resolveLxSource(song:SongResult,quality:AudioQualityPreference):Promise<OmniAudioSource|null>{
    const ref=getPlaybackSourceRef(song);
    if(ref.kind!=='online')return null;
    return withLxRuntime(async(active,state,current)=>{
        try{
            const declared=await active.ready;current();
            if(!Object.keys(declared).some(source=>source!=='local'))return null;
            const preferred=state.policy.preferredSource;
            if(preferred&&!declared[preferred])throw Error('所选音源不支持默认播放来源，请选择其他来源');
            const capabilities=preferred&&!state.policy.autoSwitch?{[preferred]:declared[preferred]}:declared;
            const deadline=Date.now()+65000;
            const excluded=new Set<string>();let lastError:unknown=Error('音源不支持此歌曲平台'),budget=12;
            for(let platformAttempt=0;platformAttempt<5;platformAttempt++){
                if(Date.now()>=deadline)throw Error('音源取流超时');
                const candidate=await matchLxCatalogSong(song,capabilities,new Set(excluded),state.policy.priority,state.policy.preferredSource);current();
                const target=getPlaybackSourceRef(candidate),source=target.kind==='online'?lxPlatformFor(target.providerId):undefined;
                if(!source||excluded.has(source)||!capabilities[source])throw Error('所选音源不支持此歌曲平台');
                excluded.add(source);
                const types=lxQualityAttempts(quality,capabilities[source].qualitys,state.policy.autoDowngrade);
                if(!types.length)lastError=Error('音源不支持所选音质，请开启自动降级或选择其他音质');
                for(const type of types){
                    for(let attempt=0;attempt<=state.policy.retries&&budget>0;attempt++){
                        budget--;current();
                        try{
                            const remaining=deadline-Date.now();if(remaining<=0)throw Error('音源取流超时');
                            const value=await active.request({source,action:'musicUrl',info:{type,musicInfo:buildLxMusicInfo(candidate,source,capabilities[source])}},remaining);
                            current();if(typeof value!=='string')throw Error('音源未返回有效播放地址');
                            const remote=validateRemoteUrl(value),url=await prepareLxAudio(remote);current();
                            noteLx('resolved','resolve',`source=${source} negotiated=${type} verified=false attempts=${12-budget}`);
                            noteOnlinePlaybackOutcome({stage:'resolve',outcome:'ok',providerId:ref.providerId,mediaId:ref.mediaId,quality,kind:`lx:${source}`});
                            return {url,fetchedAt:Date.now(),quality:(['standard','high','lossless','hires'] as const)[LX_QUALITIES.indexOf(type)],qualityVerified:false};
                        }catch(error){current();lastError=error;noteLx('attempt',classifyLx(error),error);if(active.isClosed)throw error;}
                    }
                }
                if(!state.policy.autoSwitch||budget<=0||Object.keys(capabilities).filter(s=>s!=='local').every(s=>excluded.has(s)))throw lastError;
                noteLx('fallback','switch',`excluded=${[...excluded].join(',')}`);
            }
            throw lastError;
        }catch(error){
            noteLx('failed',classifyLx(error),error);
            const detail=redactLx(error);
            throw new OnlineProviderError('unavailable',detail,ref.providerId,undefined,undefined,undefined,{userMessage:detail||'自定义源未能提供播放地址，请更换音源或恢复原音源'});
        }
    });
}

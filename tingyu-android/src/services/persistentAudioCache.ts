import type { SongResult } from '../types';
import type { AudioQualityPreference, OmniAudioSource } from '../types/onlineMusic';
import { isCapacitorAndroid } from '../platform/runtime';
import { getTingyuPlayback } from '../platform/tingyuPlayback';
import { getAudioCacheRoute, getPersistentAudioKey } from './onlineMusic/resourceKeys';

// Persistent files stay native; no base64 or complete Blob crosses the bridge on replay.
export async function readPersistentAudio(song:SongResult,quality:AudioQualityPreference):Promise<{url:string;originalRecording:boolean}|null>{
    if(!isCapacitorAndroid())return null;
    const route=getAudioCacheRoute(),ref=song.sourceRef;
    try{
        const result=await getTingyuPlayback<{audioOffline(data:object):Promise<{url:string;info?:{actualSource?:string}}>}>().audioOffline({action:'lookup',key:getPersistentAudioKey(song,quality)});
        if(!result.url||route!==getAudioCacheRoute())return null;
        const actual=result.info?.actualSource??'';
        // A matched backup can have different mastering; never reuse the original recording's gain.
        const originalRecording=ref?.kind==='online'&&(actual===ref.providerId||actual===ref.providerId+':'+ref.mediaId);
        return {url:result.url,originalRecording};
    }catch{return null;}
}
export async function bindPersistentAudio(song:SongResult,quality:AudioQualityPreference,source:OmniAudioSource|null){
    if(!isCapacitorAndroid()||!source)return;
    const ref=song.sourceRef,p=source.provenance??source.backupSource;
    const actual=p?JSON.stringify(p):ref?.kind==='online'?ref.providerId+':'+ref.mediaId:'';
    try{await getTingyuPlayback<{audioOffline(data:object):Promise<void>}>().audioOffline({action:'bind',cacheRoute:getAudioCacheRoute(),key:getPersistentAudioKey(song,quality),url:source.url,durationMs:song.durationMs,actualSource:actual,negotiatedQuality:source.quality??''});}catch{/* Disk errors never fail playback. */}
}

export function isPersistentAudioUrl(url:string):boolean {return /^http:\/\/127\.0\.0\.1:\d+\/offline-audio\//.test(url);}
export async function invalidatePersistentAudio(song:SongResult):Promise<void>{
    if(!isCapacitorAndroid())return;
    const native=getTingyuPlayback<{audioOffline(data:object):Promise<void>}>();
    await Promise.all((['standard','high','lossless','hires'] as AudioQualityPreference[]).map(quality=>native.audioOffline({action:'invalidate',key:getPersistentAudioKey(song,quality)}).catch(()=>{})));
}

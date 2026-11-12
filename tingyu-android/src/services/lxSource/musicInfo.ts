import type { SongResult } from '../../types';
import { getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { getProviderSongMetadata } from '../onlineMusic/songMetadata';
import type { LxCapability } from './contract';
import { lxPlatformFor } from './selection';

// src/services/lxSource/musicInfo.ts
// Translate the selected catalog record, never the queue record of another platform.
export function buildLxMusicInfo(song:SongResult,source:string,capability:LxCapability) {
    const ref=getPlaybackSourceRef(song);
    if(ref.kind!=='online')throw Error('歌曲平台信息无效');
    if(lxPlatformFor(ref.providerId)!==source)throw Error('歌曲 ID 与来源平台不一致');
    const metadata=getProviderSongMetadata(song),data=ref.providerData??{};
    const seconds=Math.round(metadata.durationMs/1000);
    const numericWy=source==='wy'&&/^\d+$/.test(ref.mediaId)&&Number.isSafeInteger(Number(ref.mediaId));
    const songmid=data.songMid||(numericWy?Number(ref.mediaId):ref.mediaId),songId=data.songId||(source==='wy'?songmid:ref.mediaId);
    const albumId=data.albumId||data.albumMid||metadata.album.id;
    const strMediaMid=data.strMediaMid||data.mediaMid||songmid;
    const hash=data.hash||ref.mediaId;
    const declaredMap = (data._types || data._qualitys || {}) as Record<string, Record<string, unknown>>;
    const types=capability.qualitys.map(type=>({type,size:null,...(source==='kg'?{hash}:{}),...(declaredMap[type]||{})}));
    const qualityMap=Object.fromEntries(types.map(item=>[item.type,{...item}]));
    return {...data,id:ref.mediaId,name:song.name,singer:metadata.artists.map(a=>a.name).join('、'),source,
        songmid,songId,strMediaMid,albumId,albumMid:data.albumMid,hash,copyrightId:data.copyrightId,
        interval:`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`,albumName:metadata.album.name,
        img:metadata.coverUrl,types,_types:qualityMap,typeUrl:{},
        meta:{songId:source==='tx'?songmid:songId,id:source==='tx'?songId:undefined,albumName:metadata.album.name,picUrl:metadata.coverUrl,qualitys:types,_qualitys:qualityMap,
            hash,strMediaMid,albumMid:data.albumMid,albumId,copyrightId:data.copyrightId,
            lrcUrl:data.lrcUrl,mrcUrl:data.mrcUrl,trcUrl:data.trcUrl}};
}

import type { SongResult } from '../../types';
import type { LxCapabilities } from './contract';
import { lxPlatformFor } from './selection';
import { createProviderSongMetadata } from '../../utils/songMetadata';

// src/services/lxSource/catalogMatch.ts
// Explicit cross-provider playback: preserve the original queue/library identity.
export async function matchLxCatalogSong(song:SongResult,capabilities:LxCapabilities,excluded:ReadonlySet<string>=new Set()):Promise<SongResult>{
    const ref=song.sourceRef;
    if(ref?.kind!=='online')return song;
    const platform=lxPlatformFor(ref.providerId);
    if(platform&&capabilities[platform]&&!excluded.has(platform))return song;
    const {omni}=await import('../onlineMusic/omni');
    const {normalizeLyricMatchText:normalize}=await import('../../utils/lyrics/matchScore');
    const metadata=createProviderSongMetadata(song),title=normalize(song.name);
    const artists=new Set(metadata.artists.map(artist=>normalize(artist.name)).filter(Boolean));
    // Prefer the public catalog before platforms requiring account transport.
    const sources=Object.keys(capabilities).filter(source=>!excluded.has(source));
    if(sources.includes('kw')){sources.splice(sources.indexOf('kw'),1);sources.unshift('kw')}
    for(const source of sources.slice(0,5)){
        let page;
        try {page=await omni.searchProviderSongs(`lx-${source}`,`${song.name} ${metadata.artists[0]?.name??''}`,{limit:20,offset:0});}catch(error){if(error instanceof DOMException&&error.name==='AbortError')throw error;continue;}
        const candidate=page.items.find(item=>{
            const data=createProviderSongMetadata(item);
            return normalize(item.name)===title&&artists.size>0&&data.artists.some(artist=>artists.has(normalize(artist.name)))
                &&(!(metadata.durationMs>0&&data.durationMs>0)||Math.abs(metadata.durationMs-data.durationMs)<=Math.max(5000,metadata.durationMs*.03));
        });
        if(candidate)return candidate;
    }
    throw Error('所选洛雪音源未找到匹配的歌曲版本，请更换音源或使用原平台播放');
}

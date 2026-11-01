import type { SongResult, LyricData } from '../types';
import type { OmniLyricsResult } from '../types/onlineMusic';
import { autoMatchBestLyric } from '../utils/lyrics/autoMatchBestLyric';
import { useLyricSettingsStore } from '../stores/useLyricSettingsStore';
import { loadOnlineLyricsState, resolveOnlineLyrics } from '../utils/onlineLyricsState';
import { getProviderSongMetadata } from './onlineMusic/songMetadata';
import { noteLyricsDiagnostic } from '../utils/lyricsDiagnostics';
import { cacheSharedLyrics, readSharedLyricRecord } from './sharedSongResources';

// src/services/resolveAccurateLyrics.ts
/** The existing stage matcher, invoked before a platform result is published to shared storage. */
export async function resolveAccurateLyrics(song:SongResult,result:OmniLyricsResult):Promise<LyricData|null>{
    const state=await loadOnlineLyricsState(song),settings=useLyricSettingsStore.getState();
    const selected=resolveOnlineLyrics(state,result.lyrics);
    if(state?.hasOnlineOverride||state?.lyricsSource==='imported'){if(selected)await cacheSharedLyrics(song,selected,'confirmed-match');return selected;}
    let lyrics=selected,confirmed=!settings.autoUseBestLyric;
    let selection:LyricData['resourceSelection']={source:song.sourceRef?.kind==='online'?String(song.sourceRef.providerId):'platform',mediaId:String(song.id)};
    if(settings.autoUseBestLyric){
        const metadata=getProviderSongMetadata(song),id=song.sourceRef?.kind==='online'?song.sourceRef.providerId:'';
        const providerId:'qq'|'netease'|'kugou'|null=id==='qq'||id==='netease'||id==='kugou'?id as 'qq'|'netease'|'kugou':null;
        try{
            const match=await autoMatchBestLyric(song.name,metadata.artists.map(a=>a.name).join(', '),metadata.durationMs,{
                album:metadata.album?.name,preferredSource:settings.preferredAlternativeLyricSource,
                ...(providerId?{providerCandidate:{providerId,song,lyricsResult:{lyrics:result.lyrics,isPureMusic:result.isPureMusic}}}:{}),
            });
            if(match&&'lyrics' in match){lyrics=match.lyrics;confirmed=true;selection={source:match.source,mediaId:String(match.id)};}
        }catch{/* A transport failure leaves a provisional platform version, never a none conclusion. */}
    }
    if(lyrics){
        noteLyricsDiagnostic(confirmed?'selection:confirmed-match':'selection:provisional-platform',song,{source:confirmed?'stage-matcher':'platform'});
        lyrics={...lyrics,resourceSelection:selection,resourceCacheTier:confirmed?'stage':'platform'};
        await cacheSharedLyrics(song,lyrics,confirmed?'confirmed-match':'platform-cache');
        const authority=await readSharedLyricRecord(song);
        if(authority?.userChoice||authority?.confirmedBy==='stage')lyrics=authority.lyrics;
    }
    return lyrics;
}

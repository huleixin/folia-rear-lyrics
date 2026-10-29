import type { SongResult } from '../../types';
import { OnlineProviderError, type AudioQualityPreference, type OmniAudioSource } from '../../types/onlineMusic';
import { getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { noteOnlinePlaybackOutcome } from '../../utils/onlinePlaybackDiagnostics';
import { useLxSourceStore } from '../../stores/useLxSourceStore';
import { chooseLxQuality, LX_QUALITIES, validateRemoteUrl } from './contract';
import { prepareLxAudio } from './media';
import { LxRuntime } from './client';
import { lxPlatformFor } from './selection';
import { matchLxCatalogSong } from './catalogMatch';
import { buildLxMusicInfo } from './musicInfo';

// src/services/lxSource/playback.ts
let runtime: LxRuntime | null = null;
let revision = -1;
let idle: ReturnType<typeof setTimeout> | null = null;
const activeCalls=new Map<LxRuntime,number>();
useLxSourceStore.subscribe(state => { if (state.revision !== revision) { runtime?.stop(); runtime = null; } });
export async function resolveLxSource(song: SongResult, quality: AudioQualityPreference): Promise<OmniAudioSource | null> {
    const state = useLxSourceStore.getState();
    const script = state.scripts.find(s => s.id === state.activeId);
    const ref = getPlaybackSourceRef(song);
    if (!script || ref.kind !== 'online') return null;
    if (idle) clearTimeout(idle);
    if (!runtime || runtime.isClosed || revision !== state.revision) { runtime?.stop(); runtime = new LxRuntime(script); revision = state.revision; }
    const active = runtime;
    activeCalls.set(active,(activeCalls.get(active)??0)+1);
    try {
        const capabilities = await active.ready;
        const current=()=>{if(useLxSourceStore.getState().revision!==state.revision)throw Error('音源已更换')};
        const request=async(candidate:SongResult)=>{
            current();const target=getPlaybackSourceRef(candidate);
            const source=target.kind==='online'?lxPlatformFor(target.providerId):undefined;
            if(!source||!capabilities[source])throw Error('所选音源不支持此歌曲平台');
            const type=chooseLxQuality(quality,capabilities[source].qualitys);
            const value=await active.request({source,action:'musicUrl',info:{type,musicInfo:buildLxMusicInfo(candidate,source,capabilities[source])}});
            current();if(typeof value!=='string')throw Error('音源未返回播放地址');
            return {remote:validateRemoteUrl(value),type,source};
        };
        const candidate=await matchLxCatalogSong(song,capabilities);
        let resolved;
        try {resolved=await request(candidate)} catch(firstError) {
            current();const candidateRef=getPlaybackSourceRef(candidate);
            const failed=candidateRef.kind==='online'?lxPlatformFor(candidateRef.providerId):undefined;
            // One bounded fallback through this same selected script. No official
            // preview and no mutation of the original QQ/NetEase playlist identity.
            if(!failed||Object.keys(capabilities).length<2)throw firstError;
            try {
                const alternate=await matchLxCatalogSong(song,capabilities,new Set([failed]));
                resolved=await request(alternate);
            } catch(alternateError) {
                current();throw Error(`${firstError instanceof Error?firstError.message:String(firstError)}；备用平台：${alternateError instanceof Error?alternateError.message:String(alternateError)}`);
            }
        }
        const url=await prepareLxAudio(resolved.remote);current();
        noteOnlinePlaybackOutcome({stage:'resolve',outcome:'ok',providerId:ref.providerId,mediaId:ref.mediaId,quality,kind:`lx:${resolved.source}`});
        return {url,fetchedAt:Date.now(),quality:(['standard','high','lossless','hires'] as const)[LX_QUALITIES.indexOf(resolved.type)]};
    } catch (error) {
        const detail = (error instanceof Error ? error.message : String(error)).replace(/https?:\/\/[^\s"'<>]+/gi, '[地址]').replace(/[\r\n\t]/g, ' ').slice(0, 140);
        throw new OnlineProviderError('unavailable', detail, ref.kind==='online'?ref.providerId:undefined, undefined, undefined, undefined,
            { userMessage: detail || '自定义源未能提供播放地址' });
    } finally {
        const remaining=(activeCalls.get(active)??1)-1;
        if(remaining>0)activeCalls.set(active,remaining);else activeCalls.delete(active);
        if(runtime===active&&!remaining)idle=setTimeout(()=>{if(!activeCalls.has(active)){active.stop();if(runtime===active)runtime=null}},30000);
    }
}

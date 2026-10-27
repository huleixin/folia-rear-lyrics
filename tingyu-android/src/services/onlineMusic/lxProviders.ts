import type { SongResult, UnifiedSong } from '../../types';
import type { OnlineMusicProvider, ProviderCapabilities, ProviderLyricsResult } from '../../types/onlineMusic';
import { useLxSourceStore } from '../../stores/useLxSourceStore';
import { createProviderSongMetadata } from '../../utils/songMetadata';

// src/services/onlineMusic/lxProviders.ts
export const LX_PLATFORMS: Record<string, {name:string; original?:string}> = {
    wy:{name:'网易云',original:'netease'}, tx:{name:'QQ音乐',original:'qq'}, kg:{name:'酷狗',original:'kugou'}, kw:{name:'酷我'}, mg:{name:'咪咕'},
};
const capabilities: ProviderCapabilities = {search:true,playback:true,lyrics:true,auth:false,userLibrary:false,playlists:false,albums:false,artists:false,recommendations:false,mutations:false,wordByWordLyrics:false};
function originalSong(song: SongResult, providerId: string): UnifiedSong {
    if (song.sourceRef?.kind !== 'online') throw Error('Invalid LX song');
    return {...song,id:song.sourceRef.mediaId,sourceRef:{...song.sourceRef,providerId}};
}
export function createLxProvider(platform: string, getOriginal: (id:string) => OnlineMusicProvider | null): OnlineMusicProvider {
    const spec = LX_PLATFORMS[platform], id = `lx-${platform}`;
    const normalize = (input: unknown): UnifiedSong => {
        const song = input as UnifiedSong;
        if (!song?.sourceRef || song.sourceRef.kind !== 'online') throw Error('Invalid LX catalog song');
        return {...song,id:`${id}:${song.sourceRef.mediaId}`,sourceRef:{...song.sourceRef,providerId:id,providerData:{...song.sourceRef.providerData,lxPlatform:platform}}};
    };
    return { id, displayName:`洛雪 · ${spec.name}`, shortName:`洛雪${spec.name}`, capabilities,
        getAvailability: () => ({configured:!!useLxSourceStore.getState().scripts.find(s=>s.id===useLxSourceStore.getState().activeId)?.capabilities[platform]}),
        normalizeSong: normalize, songMetadata:{getSongMetadata:createProviderSongMetadata},
        search:{async searchSongs(query,limit,offset,signal) {
            if (!spec.original) { const {searchLxCatalog}=await import('./lxCatalog'); return searchLxCatalog(platform as 'kw'|'mg',query,limit,offset,signal); }
            const base = getOriginal(spec.original);
            if (!base?.search) throw Error('平台搜索暂时不可用');
            const page = await base.search.searchSongs(query,limit,offset,signal);
            return {...page,items:page.items.map(normalize)};
        }},
        playback:{
            async getSongDetail(mediaId) { const base = spec.original ? getOriginal(spec.original) : null; const detail = base ? await base.playback?.getSongDetail(mediaId) : null; return detail ? normalize(detail) : null; },
            async getAudioSource(song,quality) {
                const {resolveLxSource} = await import('../lxSource/playback');
                const source = await resolveLxSource(song,quality);
                if (!source) throw Error('请先启用支持该平台的洛雪自定义源');
                return source;
            },
        },
        lyrics:{ async getLyrics(song): Promise<ProviderLyricsResult> {
            const base = spec.original ? getOriginal(spec.original) : null;
            if (base?.lyrics && spec.original) return base.lyrics.getLyrics(originalSong(song,spec.original));
            const {getLxCatalogLyrics} = await import('./lxCatalogLyrics');
            return getLxCatalogLyrics(platform,song);
        }},
    };
}
/** Registry changes are event-driven; importing or enabling a script never creates a VM here. */
export function installLxProviders(register:(provider:OnlineMusicProvider)=>void, unregister:(id:string)=>void, getOriginal:(id:string)=>OnlineMusicProvider|null) {
    const registered = new Set<string>();
    const sync = () => {
        const state = useLxSourceStore.getState(), script = state.scripts.find(s=>s.id===state.activeId);
        const desired = Object.keys(script?.capabilities || {}).filter(key=>LX_PLATFORMS[key]);
        for (const key of registered) if (!desired.includes(key)) { unregister(`lx-${key}`); registered.delete(key); }
        for (const key of desired) { register(createLxProvider(key,getOriginal)); registered.add(key); }
    };
    const unsubscribe = useLxSourceStore.subscribe((state,previous)=>{if(state.revision!==previous.revision)sync();});
    sync();
    return unsubscribe;
}

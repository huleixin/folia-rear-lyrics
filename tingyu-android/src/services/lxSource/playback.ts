import type { SongResult } from '../../types';
import type { AudioQualityPreference, OmniAudioSource } from '../../types/onlineMusic';
import { getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { getProviderSongMetadata } from '../onlineMusic/songMetadata';
import { useLxSourceStore } from '../../stores/useLxSourceStore';
import { chooseLxQuality, LX_QUALITIES, validateRemoteUrl } from './contract';
import { LxRuntime } from './client';

// src/services/lxSource/playback.ts
let runtime: LxRuntime | null = null;
let revision = -1;
let idle: ReturnType<typeof setTimeout> | null = null;
useLxSourceStore.subscribe(state => { if (state.revision !== revision) { runtime?.stop(); runtime = null; } });
export async function resolveLxSource(song: SongResult, quality: AudioQualityPreference): Promise<OmniAudioSource | null> {
    const state = useLxSourceStore.getState();
    const script = state.scripts.find(s => s.id === state.activeId);
    const ref = getPlaybackSourceRef(song);
    if (!script || ref.kind !== 'online') return null;
    const platform: Record<string, string> = { netease: 'wy', qq: 'tx', kugou: 'kg' };
    const source = platform[ref.providerId];
    if (!source) return null;
    if (idle) clearTimeout(idle);
    if (!runtime || revision !== state.revision) { runtime?.stop(); runtime = new LxRuntime(script); revision = state.revision; }
    const active = runtime;
    try {
        const capabilities = await active.ready;
        if (!capabilities[source]) return null;
        const type = chooseLxQuality(quality, capabilities[source].qualitys);
        const metadata = getProviderSongMetadata(song);
        const data = ref.providerData || {};
        const seconds = Math.round(metadata.durationMs / 1000);
        const types = capabilities[source].qualitys.map(q => ({ type: q, size: null, ...(source === 'kg' ? { hash: data.hash || ref.mediaId } : {}) }));
        const qualityMap = Object.fromEntries(types.map(q => [q.type, { ...q }]));
        const musicInfo = { id: `${source}_${ref.mediaId}`, strMediaMid: data.mediaMid || data.songMid || ref.mediaId, albumMid: data.albumMid, name: song.name, singer: metadata.artists.map(a => a.name).join('、'), source,
            songmid: ref.providerId === 'qq' ? data.songMid || ref.mediaId : ref.mediaId,
            songId: data.songId || ref.mediaId, hash: data.hash || ref.mediaId, albumId: data.albumId || metadata.album.id,
            interval: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, albumName: metadata.album.name,
            meta: { songId: data.songId || ref.mediaId, albumName: metadata.album.name, picUrl: metadata.coverUrl, qualitys: types, _qualitys: qualityMap, hash: data.hash || ref.mediaId, strMediaMid: data.mediaMid || data.songMid || ref.mediaId, albumMid: data.albumMid, albumId: data.albumId || metadata.album.id },
            _types: qualityMap, types, ...data,
        };
        const value = await active.request({ source, action: 'musicUrl', info: { type, musicInfo } });
        if (useLxSourceStore.getState().revision !== state.revision) throw Error('音源已更换');
        if (typeof value !== 'string') throw Error('音源未返回播放地址');
        return { url: validateRemoteUrl(value), fetchedAt: Date.now(), quality: (['standard','high','lossless','hires'] as const)[LX_QUALITIES.indexOf(type)] };
    } finally { idle = setTimeout(() => { active.stop(); if (runtime === active) runtime = null; }, 30000); }
}

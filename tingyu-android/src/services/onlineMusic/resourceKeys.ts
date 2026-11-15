import { selectedLxScript } from '../lxSource/selection';
import sha256 from 'crypto-js/sha256';
import { useLxSourceStore } from '../../stores/useLxSourceStore';
import { useAudioSettingsStore } from '../../stores/useAudioSettingsStore';
import type { AudioQualityPreference } from '../../types/onlineMusic';
import type { SongResult } from '../../types';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../../utils/appPlaybackGuards';

// src/services/onlineMusic/resourceKeys.ts

export type SongResourceKind = 'audio' | 'lyric' | 'cover' | 'theme' | 'replayGain';

const scriptHashes=new Map<string,string>();
/** Stable content stamp; policy changes do not destroy the already cached recording. */
function scriptStamp(code:string){let cached=scriptHashes.get(code);if(cached)return cached;cached=sha256(code).toString();if(scriptHashes.size>=8)scriptHashes.clear();scriptHashes.set(code,cached);return cached;}
export const getAudioCacheRoute=()=>{
    const state=useLxSourceStore.getState(),active=selectedLxScript();
    const scripts=active?[active,...(state.policy.scriptFallback?state.policy.scriptOrder.map(id=>state.scripts.find(s=>s.id===id)).filter((s):s is NonNullable<typeof s>=>!!s&&s.id!==active.id):[])]:[];
    const route=scripts.length?state.policy.routing+':'+scripts.map(s=>s.id+':'+scriptStamp(s.code)).join(',')+':'+(state.policy.preferredSource??'')+':'+state.policy.autoSwitch+':'+state.policy.priority.join(',')+':'+state.policy.autoDowngrade:'original';
    return scriptStamp(route);
};
export const getPersistentAudioKey=(song:SongResult,quality:AudioQualityPreference)=>
    'offline_v1_'+quality+'_'+getAudioCacheRoute()+'_'+getPlaybackSongKey(song);
export const getSongResourceCacheKey = (kind: SongResourceKind, song: SongResult, quality?: AudioQualityPreference): string => {
    const sourceRef = getPlaybackSourceRef(song);
    const versionedKind = kind === 'cover'
        && sourceRef.kind === 'online'
        && sourceRef.providerId === 'kugou'
        ? 'cover_v2'
        : kind;
    const lxId = kind === 'audio' && sourceRef.kind === 'online' ? selectedLxScript()?.id : null;
    const variant = lxId ? `lx_${lxId}_${getAudioCacheRoute()}_${quality ?? useAudioSettingsStore.getState().audioQuality}_` : '';
    return `${versionedKind}_${variant}${getPlaybackSongKey(song)}`;
};

export const getLegacySongResourceCacheKeys = (kind: SongResourceKind, song: SongResult): string[] => {
    if (kind === 'audio' && selectedLxScript()) return [];
    const sourceRef = getPlaybackSourceRef(song);
    if (sourceRef.kind !== 'online' || sourceRef.providerId !== 'netease') return [];
    return [
        ...(sourceRef.variant === 'cloud' ? [`${kind}_cloud_${sourceRef.mediaId}`] : []),
        `${kind}_${sourceRef.mediaId}`,
    ];
};

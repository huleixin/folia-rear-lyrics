import type { SongResult } from '../../types';
import type { AudioQualityPreference, OmniAudioSource } from '../../types/onlineMusic';
import { useLxSourceStore } from '../../stores/useLxSourceStore';
import { getSongResourceCacheKey } from './resourceKeys';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { toPlayableAudioUrl } from '../../utils/appPlaybackHelpers';

// src/services/onlineMusic/audioSourceBinding.ts
const bindings = new Map<string, string | null>();
const identity = (song: SongResult, url: string) => `${getPlaybackSongKey(song)}\0${url}`;
/** Bind bytes to the source/quality that resolved them, even if selection changes mid-download. */
export function captureAudioSourceBinding(song: SongResult, quality: AudioQualityPreference) {
    const revision = useLxSourceStore.getState().revision;
    const key = getSongResourceCacheKey('audio', song, quality);
    return (source: OmniAudioSource | null) => {
        if (useLxSourceStore.getState().revision !== revision) throw new DOMException('Audio source changed', 'AbortError');
        const url = toPlayableAudioUrl(source?.url);
        if (url) {
            // A backup must never be persisted as the original platform's recording/quality.
            bindings.set(identity(song, url), source?.backupSource ? null : key);
            while (bindings.size > 256) bindings.delete(bindings.keys().next().value!);
        }
        return source;
    };
}
export function resolvedAudioCacheKey(song: SongResult, url: string): string | null {
    const id = identity(song, url);
    // Unknown/evicted bindings cannot prove which recording produced these bytes.
    if (bindings.has(id)) return bindings.get(id)!;
    return getPlaybackSourceRef(song).kind === 'online' ? null : getSongResourceCacheKey('audio', song);
}

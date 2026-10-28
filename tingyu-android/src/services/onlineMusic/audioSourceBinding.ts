import type { SongResult } from '../../types';
import type { AudioQualityPreference, OmniAudioSource } from '../../types/onlineMusic';
import { useLxSourceStore } from '../../stores/useLxSourceStore';
import { getSongResourceCacheKey } from './resourceKeys';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import { toPlayableAudioUrl } from '../../utils/appPlaybackHelpers';

// src/services/onlineMusic/audioSourceBinding.ts
const bindings = new Map<string, string>();
const identity = (song: SongResult, url: string) => `${getPlaybackSongKey(song)}\0${url}`;
/** Bind bytes to the source/quality that resolved them, even if selection changes mid-download. */
export function captureAudioSourceBinding(song: SongResult, quality: AudioQualityPreference) {
    const revision = useLxSourceStore.getState().revision;
    const key = getSongResourceCacheKey('audio', song, quality);
    return (source: OmniAudioSource | null) => {
        if (useLxSourceStore.getState().revision !== revision) throw new DOMException('Audio source changed', 'AbortError');
        const url = toPlayableAudioUrl(source?.url);
        if (url) {
            bindings.set(identity(song, url), key);
            while (bindings.size > 256) bindings.delete(bindings.keys().next().value!);
        }
        return source;
    };
}
export function resolvedAudioCacheKey(song: SongResult, url: string): string | null {
    return bindings.get(identity(song, url)) ?? (useLxSourceStore.getState().activeId ? null : getSongResourceCacheKey('audio', song));
}

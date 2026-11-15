import type { SongResult } from '../../types';
import type { AudioQualityPreference } from '../../types/onlineMusic';
import { readPersistentAudio, isPersistentAudioUrl } from '../persistentAudioCache';

// src/services/automix/nativeAnalysisAudio.ts
// Analysis reuses a verified native file; it never refetches the remote audio or writes a Blob cache.
export async function readNativeAnalysisAudio(song: SongResult, quality: AudioQualityPreference): Promise<ArrayBuffer | null> {
    const cached = await readPersistentAudio(song, quality);
    if (!cached || !isPersistentAudioUrl(cached.url)) return null;
    try {
        const response = await fetch(cached.url);
        if (!response.ok) return null;
        return await response.arrayBuffer();
    } catch { return null; }
}

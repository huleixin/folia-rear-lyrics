import { getTingyuPlayback } from '../platform/tingyuPlayback';
import { notePlaybackTest } from './playbackTestLog';

// src/services/nativeAudioCache.ts
// IndexedDB remains authoritative. Only one bounded slice crosses the bridge at a time.
export const AUDIO_CACHE_CHUNK_BYTES = 64 * 1024;
export const NATIVE_AUDIO_STAGE_LIMIT = 256 * 1024 * 1024;
interface CachePort {
    audioCacheBegin(options: { size: number; mime: string }): Promise<{ token: string }>;
    audioCacheAppend(options: { token: string; offset: number; data: string }): Promise<unknown>;
    audioCacheFinish(options: { token: string }): Promise<{ uri: string }>;
    audioCacheRelease(options: { token: string }): Promise<unknown>;
}
export interface NativeAudioSource { uri: string; release(): Promise<void> }
export async function prepareNativeAudioSource(source: string, isCurrent: () => boolean): Promise<NativeAudioSource> {
    if (!source.startsWith('blob:')) return { uri: source, release: async () => {} };
    const port = getTingyuPlayback<CachePort>();
    const response = await fetch(source);
    if (!response.ok) throw new Error('Cached audio is unavailable');
    const blob = await response.blob(); // Blob handle; never read the complete file into an ArrayBuffer.
    if (blob.size < 16384 || blob.size > NATIVE_AUDIO_STAGE_LIMIT || /^(text\/|application\/(json|xml))/.test(blob.type))
        throw new Error('Cached audio size or format is invalid');
    if (!isCurrent()) throw new DOMException('Replaced cache request', 'AbortError');
    const { token } = await port.audioCacheBegin({ size: blob.size, mime: blob.type });
    let released = false;
    const release = async () => { if (!released) { released = true; await port.audioCacheRelease({ token }); } };
    try {
        for (let offset = 0; offset < blob.size; offset += AUDIO_CACHE_CHUNK_BYTES) {
            if (!isCurrent()) throw new DOMException('Replaced cache request', 'AbortError');
            const bytes = new Uint8Array(await blob.slice(offset, offset + AUDIO_CACHE_CHUNK_BYTES).arrayBuffer());
            let binary = '';
            for (const byte of bytes) binary += String.fromCharCode(byte);
            await port.audioCacheAppend({ token, offset, data: btoa(binary) });
        }
        if (!isCurrent()) throw new DOMException('Replaced cache request', 'AbortError');
        const { uri } = await port.audioCacheFinish({ token });
        if (!isCurrent()) throw new DOMException('Replaced cache request', 'AbortError');
        notePlaybackTest('native-cache-ready', { bytes: blob.size });
        return { uri, release };
    } catch (error) {
        await release().catch(() => {});
        throw error;
    }
}

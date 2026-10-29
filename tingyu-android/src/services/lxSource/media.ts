import { Capacitor } from '@capacitor/core';
import { proxyNativeRemoteAudioUrl } from '../nativeRemoteAudio';

// src/services/lxSource/media.ts
// Register once and let the active engine open the stream. A bytes=0-0 probe
// rejects servers without tiny-range support and can consume single-use URLs.
export async function prepareLxAudio(url: string): Promise<string> {
    return Capacitor.isNativePlatform() ? proxyNativeRemoteAudioUrl(url, true) : url;
}

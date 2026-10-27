import { Capacitor } from '@capacitor/core';
import { proxyNativeRemoteAudioUrl } from '../nativeRemoteAudio';

// src/services/lxSource/media.ts
// Only probe the local forwarder: one byte detects expired/HTML URLs before the media element hides the reason.
export async function prepareLxAudio(url: string): Promise<string> {
    if (!Capacitor.isNativePlatform()) return url;
    const local = await proxyNativeRemoteAudioUrl(url, true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    let response: Response | undefined;
    try {
        response = await fetch(local, { headers: { Range: 'bytes=0-0' }, signal: controller.signal, cache: 'no-store' });
        if (!response.ok) {
            const upstream = response.headers.get('X-Tingyu-Upstream-Status');
            throw Error(upstream && /^\d{3}$/.test(upstream)
                ? `音源服务器返回 HTTP ${upstream}，没有可播放的音频`
                : `音频转发失败（HTTP ${response.status}）`);
        }
        const type = response.headers.get('content-type') || '';
        if (/text\/|json|xml/i.test(type)) throw Error('音源返回了网页或错误信息，没有返回音频');
        const reader = response.body?.getReader();
        if (reader) {
            try { const first = await reader.read(); if (first.done || !first.value?.length) throw Error('音源返回了空音频'); }
            finally { await reader.cancel().catch(() => {}); }
        }
        return local;
    } catch (error) {
        if (controller.signal.aborted) throw Error('音源音频连接超时');
        throw error;
    } finally {
        clearTimeout(timer);
        if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
    }
}

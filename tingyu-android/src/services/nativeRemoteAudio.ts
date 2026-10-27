// src/services/nativeRemoteAudio.ts
// Routes signed Kuwo/Bodian URLs through the Android Range-capable local stream server.

export const proxyNativeRemoteAudioUrl = async (url: string, lxSource = false): Promise<string> => {
    if (!url || typeof window === 'undefined') return url;
    const plugin = (window as any).Capacitor?.Plugins?.FoliaNative;
    if (!plugin?.registerRemoteAudio) { if (lxSource) throw Error('原生音频转发未就绪，请重新打开听屿'); return url; }
    try {
        const result = await plugin.registerRemoteAudio(lxSource ? { url, lxSource: true } : { url });
        if (lxSource && !(typeof result?.url === 'string' && /^http:\/\/127\.0\.0\.1:\d+\/remote-audio\//.test(result.url))) throw Error('自定义源音频转发失败');
        return typeof result?.url === 'string' && result.url ? result.url : url;
    } catch (error) {
        if (lxSource) throw error;
        console.warn('[NativeRemoteAudio] proxy registration failed', error);
        return url;
    }
};

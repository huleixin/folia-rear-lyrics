import { useEffect, useState } from 'react';
import { COMPOSE_CHROME } from '../services/nativeChrome';
import { isWebManagedArtworkUrl, nativeCoverThumbnail } from '../services/nativeCoverThumbnail';

// src/hooks/useNativeChromeCover.ts
//
// 迷你播放器（真机 Compose 版）的封面过桥适配。
//
// 本地曲库封面是 /__folia_cover/<assetId>、blob: 这类只在 WebView 内有效的地址，
// Kotlin 侧 pageImage() 只能解 data:image/...;base64 或带 host 的 http(s)。以前这里只把
// blob: 转成缩略图，/__folia_cover/ 原样透传，Coil 加载失败 → 冷启动永远显示默认音符，
// 而资料库列表/最近播放走 useNativePageImages、极简页/通知走统一入口，所以只有迷你条坏。
//
// 复用列表侧同一套 96px 缩略图缓存（nativeCoverThumbnail）：生成的是几 KB 的 data:，
// 足够 34dp 小图，也不会撑大原生 chrome 包体或持久化缓存。解析完成必须 setState，
// 否则 useStableNativeData 认为 data 未变、sameNativeEnvelope 为真，原生收不到新一帧。

type Resolved = { url: string; value: string };

export function useNativeChromeCover(url: string | null | undefined, active: boolean): string {
    const source = url || '';
    const [resolved, setResolved] = useState<Resolved | null>(null);
    const [runtimeGeneration, setRuntimeGeneration] = useState(0);

    // 挂载即主动解析当前有效封面，不依赖切歌/点击播放等后续事件。
    // nativeCoverThumbnail 按 URL 合并请求并缓存，重复调用不会重复解码。
    useEffect(() => {
        if (!COMPOSE_CHROME || !active || !isWebManagedArtworkUrl(source)) return;
        let alive = true;
        void nativeCoverThumbnail(source).then(value => {
            if (!alive || !value) return;
            setResolved(previous => (
                previous?.url === source && previous.value === value ? previous : { url: source, value }
            ));
        });
        return () => { alive = false; };
    }, [source, active, runtimeGeneration]);

    // 冷启动的两种「暂时读不到」都不是歌曲变化，必须靠真实事件补一次：
    //   · controllerchange：首次访问 / worker 升级时尚未控制页面，/__folia_cover/ 的 fetch
    //     会落空；这是「worker 已认领页面」的权威信号。
    //   · folia-local-music-updated：封面补全落库、二进制资产写入完成。缓存未命中时
    //     assetId 可能不变，URL 不变就不会触发上面的 effect，需要它来重试一次。
    // 两者都是有界、事件驱动的重试：nativeCoverThumbnail 成功即按 URL 缓存，
    // 后续触发直接命中缓存；没有固定延迟、不重播歌曲、不改动播放进度。
    useEffect(() => {
        if (!COMPOSE_CHROME || !active || !isWebManagedArtworkUrl(source)) return;
        const retry = () => setRuntimeGeneration(value => value + 1);
        const container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
        container?.addEventListener?.('controllerchange', retry);
        if (typeof window !== 'undefined') {
            window.addEventListener('folia-local-music-updated', retry);
        }
        return () => {
            container?.removeEventListener?.('controllerchange', retry);
            if (typeof window !== 'undefined') {
                window.removeEventListener('folia-local-music-updated', retry);
            }
        };
    }, [source, active]);

    if (!COMPOSE_CHROME) return source;                 // WebView DOM 版自己能读 Web 地址
    if (!isWebManagedArtworkUrl(source)) return source; // http(s) CDN / 已是 data: 原样交给原生
    // 解析完成前允许占位图；异步结果只认与当前 URL 相同的那一次，绝不把上一首的封面贴到下一首。
    return resolved?.url === source ? resolved.value : '';
}

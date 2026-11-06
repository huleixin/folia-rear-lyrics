import { useEffect } from 'react';
import { isAndroidNativeRuntime } from '../services/nativeLocalMusic';
import { findNativeSongsNeedingHydration, hydrateNativeSongs } from '../services/nativeLocalMetadata';
import { usePlaybackStore } from '../stores/usePlaybackStore';

// src/hooks/useNativeLocalMetadataBackfill.ts
/**
 * 启动时补一次安卓本地歌的标签。
 *
 * 为什么需要它：标签补全目前挂在「扫描 / 导入」之后，而升级上来的用户曲库早就建好了，
 * 不会再触发扫描 —— 那些歌会一直停在「没有封面、没有内嵌歌词」的状态，用户只能自己
 * 去点一次「刷新」才发现变好了。这里在启动后静默补一批（每首只读文件头几 MB），
 * 补过的歌带 embeddedMetadataVersion，下次启动直接跳过。
 *
 * 只在安卓原生运行时跑：网页/桌面的本地歌有 File System Access 句柄，
 * 走的是另一条导入链路，不需要这里。
 */

// 模块级防并行（稳定性专项风险一）：WebView 重载/组件重挂后 effect 会重新注册，
// 上一轮批可能还在跑。串行化而不是叠加并发，避免双份 IO/worker/写库负载。
let backfillInFlight = false;

export const useNativeLocalMetadataBackfill = (): void => {
    useEffect(() => {
        if (!isAndroidNativeRuntime()) return;
        let cancelled = false;
        const run = async () => {
            if (backfillInFlight) return;
            backfillInFlight = true;
            try {
                const pending = await findNativeSongsNeedingHydration();
                if (cancelled || pending.length === 0) return;
                // 当前正在播的这一首先单独跑一批：批量模式每 25 首才 flush 一次事件，
                // 等它轮到当前歌时首屏早就过去了。单独一批会立刻落库并派发
                // folia-local-music-updated，播放器快照随之补上刚抽出来的封面。
                const current = usePlaybackStore.getState().currentSong;
                const currentId = (current as unknown as { localRef?: { songId?: string } } | null)?.localRef?.songId;
                const currentIndex = currentId ? pending.findIndex(song => song.id === currentId) : -1;
                if (currentIndex >= 0) {
                    const [currentSong] = pending.splice(currentIndex, 1);
                    await hydrateNativeSongs([currentSong], { limit: 1, concurrency: 1, isCancelled: () => cancelled });
                    if (cancelled) return;
                }
                // 一次启动最多补 200 首：几千首一口气跑完会长时间占着 CPU 和 IO，
                // 分几次启动补完对用户完全无感，而且每补一批界面就会自己刷新。
                // 贯穿式取消：组件卸载（WebView 重载/路由重建）后立即停止剩余歌曲，
                // 已解析完的部分照常落库，下次启动从上次进度继续。
                const stats = await hydrateNativeSongs(pending, { limit: 200, concurrency: 2, isCancelled: () => cancelled });
                console.log(
                    `[NativeLocalMetadata] Startup backfill: ${stats.hydrated}/${pending.length} songs`
                    + (pending.length > 200 ? ` (${pending.length - 200} left for next launch)` : ''),
                );
            } catch (error) {
                console.warn('[NativeLocalMetadata] Startup backfill failed:', error);
            } finally {
                backfillInFlight = false;
            }
        };
        // 让启动动画、首屏渲染先跑完再开始，避免和冷启动抢主线程。
        const timer = setTimeout(() => { void run(); }, 4000);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, []);
};

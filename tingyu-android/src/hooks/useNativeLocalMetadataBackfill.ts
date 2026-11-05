import { useEffect } from 'react';
import { isAndroidNativeRuntime } from '../services/nativeLocalMusic';
import { findNativeSongsNeedingHydration, hydrateNativeSongs } from '../services/nativeLocalMetadata';

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
export const useNativeLocalMetadataBackfill = (): void => {
    useEffect(() => {
        if (!isAndroidNativeRuntime()) return;
        let cancelled = false;
        const run = async () => {
            try {
                const pending = await findNativeSongsNeedingHydration();
                if (cancelled || pending.length === 0) return;
                // 一次启动最多补 200 首：几千首一口气跑完会长时间占着 CPU 和 IO，
                // 分几次启动补完对用户完全无感，而且每补一批界面就会自己刷新。
                const stats = await hydrateNativeSongs(pending, { limit: 200, concurrency: 2 });
                console.log(
                    `[NativeLocalMetadata] Startup backfill: ${stats.hydrated}/${pending.length} songs`
                    + (pending.length > 200 ? ` (${pending.length - 200} left for next launch)` : ''),
                );
            } catch (error) {
                console.warn('[NativeLocalMetadata] Startup backfill failed:', error);
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

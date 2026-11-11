import { useLayoutEffect, type RefObject } from 'react';
import { animate, motionValue } from 'framer-motion';
import { chromeNative, PREHIDE_COMPOSE_CHROME, type NativeStageLayout } from '../../../../services/nativeChrome';
import { nativeLandscapeSubtitleBottom } from '../../../../utils/mobileStageSubtitleClearance';

// src/components/app/overlays/mobile-stage/useNativeStageSubtitleBottom.ts
export function resolveNativeStageSubtitleBottom(layout: NativeStageLayout, presence: number, cssWidth: number): number {
    if (!layout.active || !(layout.width > layout.height) || !(layout.height > 0) || !(cssWidth > 0)
        || !Number.isFinite(layout.shownBottom) || !Number.isFinite(layout.hiddenBottom)) return -1;
    // 4dp 是字幕与播放条上沿的距离，位移和 Compose 控件一致，最后钳在安全区上方。
    return Math.max(layout.hiddenBottom, layout.shownBottom - (layout.shownBottom - 4) * (1 - presence)) * cssWidth / layout.width;
}

/** 原生只发布显隐/几何变化；逐帧更新留在 MotionValue，不重渲染 React 树。 */
export function useNativeStageSubtitleBottom(stageRef: RefObject<HTMLDivElement | null>) {
    useLayoutEffect(() => {
        if (!PREHIDE_COMPOSE_CHROME) return;
        let disposed = false, received = false;
        let layout: NativeStageLayout | undefined;
        let remove: (() => Promise<void>) | undefined;
        let animation: ReturnType<typeof animate> | undefined;
        const presence = motionValue(1);
        const publish = () => {
            nativeLandscapeSubtitleBottom.set(layout && window.innerWidth > window.innerHeight
                ? resolveNativeStageSubtitleBottom(layout, presence.get(), window.innerWidth) : -1);
        };
        const unsubscribe = presence.on('change', publish);
        const accept = (next: NativeStageLayout) => {
            if (disposed) return;
            const previous = layout;
            layout = next;
            animation?.stop();
            const shown = next.shown ? 1 : 0;
            if (!previous || previous.width !== next.width || previous.height !== next.height || !previous.active || !next.active) {
                presence.set(shown);
            } else {
                animation = animate(presence, shown, {duration: Math.max(0, next.durationMs || 0) / 1000, ease: [0.4, 0, 0.2, 1]});
            }
            publish();
        };
        void chromeNative.addListener('stageLayout', next => {received = true; accept(next);}).then(listener => {
            if (disposed) { void listener.remove(); return; }
            remove = listener.remove;
            // 注册后再读初值，防止进场时错过首次布局事件；较晚回执不能覆盖事件。
            void chromeNative.getStageLayout().then(next => {if (!received) accept(next);}).catch(() => {});
        }).catch(() => {});
        window.addEventListener('resize', publish);
        return () => {
            disposed = true; animation?.stop(); unsubscribe(); void remove?.();
            window.removeEventListener('resize', publish);
            nativeLandscapeSubtitleBottom.set(-1);
        };
    }, [stageRef]);
}

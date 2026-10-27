import { useEffect, useRef } from 'react';
import { useImmersiveChromeStore } from '../stores/useImmersiveChromeStore';

// src/hooks/useImmersiveChromeReveal.ts
// 全沉浸模式在播放界面的“触摸唤回”：进入时收起，触摸屏幕后显示，静止一段时间再收起。

/**
 * 与播放页的自动隐藏共用同一套节奏：3 秒无操作收起，交互时唤回。
 *
 * 与原有自动隐藏的关系：`autoHidePlayerChrome` 已经打开时不接管，避免两个计时器
 * 互相打架；此时全沉浸只保证第一次进入播放界面是收起的。
 */
const IMMERSIVE_AUTO_HIDE_DELAY_MS = 3000;

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'touchstart', 'keydown', 'wheel'] as const;

type UseImmersiveChromeRevealOptions = {
    /** 全沉浸偏好已打开 */
    immersiveEnabled: boolean;
    /** 当前处于播放界面 */
    isPlayerView: boolean;
    /** 播放页原有的自动隐藏偏好；它开着时这里不接管 */
    autoHidePlayerChrome: boolean;
    /** Start visible and begin the idle countdown (used by the mobile Android lyric stage). */
    startHidden?: boolean;
    /** Mirrors the chrome visibility into native status/navigation bars when provided. */
    onSystemBarsVisible?: (visible: boolean) => void;
};

export const useImmersiveChromeReveal = ({
    immersiveEnabled,
    isPlayerView,
    autoHidePlayerChrome,
    startHidden = true,
    onSystemBarsVisible,
}: UseImmersiveChromeRevealOptions): void => {
    const setHidden = useImmersiveChromeStore(state => state.setImmersiveChromeHidden);
    const timerRef = useRef<number | null>(null);
    const ownsRevealRef = useRef(false);

    useEffect(() => {
        const clearTimer = () => {
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
        const applyHidden = (hidden: boolean) => {
            setHidden(hidden);
            onSystemBarsVisible?.(!hidden);
        };

        // 只有“全沉浸 + 播放界面 + 原有自动隐藏未开启”时才由本钩子接管。
        const owns = immersiveEnabled && isPlayerView && !autoHidePlayerChrome;
        ownsRevealRef.current = owns;

        if (!owns) {
            clearTimer();
            // 不接管时把状态复位为「收起」：全沉浸的语义是进入播放界面先收起，
            // 之后由原有机制（自动隐藏 / 常显）决定何时唤回。
            setHidden(immersiveEnabled && isPlayerView);
            onSystemBarsVisible?.(true);
            return clearTimer;
        }

        const scheduleHide = () => {
            clearTimer();
            timerRef.current = window.setTimeout(() => {
                timerRef.current = null;
                applyHidden(true);
            }, IMMERSIVE_AUTO_HIDE_DELAY_MS);
        };
        const reveal = () => {
            applyHidden(false);
            scheduleHide();
        };

        // The Android mobile stage gives users a short look at the controls, then hides both
        // application chrome and system bars. Other immersive surfaces keep their prior entry state.
        if (startHidden) applyHidden(true);
        else reveal();

        ACTIVITY_EVENTS.forEach(eventName => {
            window.addEventListener(eventName, reveal, { passive: true });
        });
        const nativeGesture = (event: Event) => {
            if ((event as CustomEvent<{held:boolean}>).detail?.held) { applyHidden(false); clearTimer(); }
            else reveal();
        };
        window.addEventListener('tingyu-native-chrome-interaction',nativeGesture);


        return () => {
            clearTimer();
            window.removeEventListener('tingyu-native-chrome-interaction',nativeGesture);
            ACTIVITY_EVENTS.forEach(eventName => {
                window.removeEventListener(eventName, reveal);
            });
        };
    }, [autoHidePlayerChrome, immersiveEnabled, isPlayerView, onSystemBarsVisible, setHidden, startHidden]);
};

export default useImmersiveChromeReveal;

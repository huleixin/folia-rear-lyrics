import { motion } from 'framer-motion';
import { useLiquidReduced } from '../../../shared/useLiquidReduced';
import { TY_DURATION, TY_SPRING } from '../../../shared/motionTokens';
import { registerModalBack } from '../../../../services/modalBackStack';
import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { AudioLines, Captions, AlarmClock, Palette, Settings2, SlidersHorizontal } from 'lucide-react';
import PlayerControlIcon from '../../icons/PlayerControlIcon';
import { useTranslation } from 'react-i18next';
import './mobileStageMenu.css';
import { useAppViewStore } from '../../../../stores/useAppViewStore';
import { openNativeQueueSheet } from '../../../../services/nativeMinimalQueue';
import { openNativeToolPage } from '../../../../services/nativeMinimalTools';
import { openNativeSleepTimer } from '../../../../services/nativePlayerSleep';
import { useSleepTimerStore } from '../../../../stores/useSleepTimerStore';
import { warmSettingsModule } from '../../dialogs/settingsModule';
import { openSettings } from '../../../../stores/useSettingsModalStore';
import { useAudioSettingsStore } from '../../../../stores/useAudioSettingsStore';
import { useAudioToolsStore, QUALITY_LABELS } from '../../../../stores/useAudioToolsStore';

// src/components/app/overlays/mobile-stage/MobileStageMenu.tsx
export default function MobileStageMenu({
    onClose,
    /** true = 正在播 160ms 退场动画；播完回调 onClosed，由宿主摘除。 */
    closing = false,
    onClosed,
}: {
    onClose: () => void;
    closing?: boolean;
    onClosed?: () => void;
}) {
    const { t } = useTranslation();
    const reduced = useLiquidReduced();
    const quality = useAudioSettingsStore(state => state.audioQuality);
    const effectsEnabled = useAudioSettingsStore(state => state.audioEqualizerSettings.enabled);
    const ref = useRef<HTMLDivElement>(null);
    const closeRef = useRef(onClose);
    useLayoutEffect(() => { closeRef.current = onClose; }, [onClose]);
    useEffect(() => registerModalBack(() => closeRef.current()), []);
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
        const outside = (event: PointerEvent) => {
            if ((event.target as Element)?.closest?.('[data-mps-more], [data-min-more]')) return;
            if (!ref.current?.contains(event.target as Node)) closeRef.current();
        };
        const key = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeRef.current();
                return;
            }
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const index =
                event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                    ? buttons.length - 1
                    : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
            buttons[index]?.focus();
        };
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('keydown', key, true);
        const nativeInteraction=()=>closeRef.current();
        window.addEventListener('tingyu-native-chrome-interaction',nativeInteraction);
        return () => {
            document.removeEventListener('pointerdown', outside, true);
            document.removeEventListener('keydown', key, true);
            window.removeEventListener('tingyu-native-chrome-interaction',nativeInteraction);
            previous?.isConnected && previous.focus();
        };
    }, []);
    const pendingAction = useRef<(() => void) | null>(null);
    const completed = useRef(false);
    const closingRef = useRef(closing);
    useLayoutEffect(() => {
        closingRef.current = closing;
        if (!closing) { completed.current = false; pendingAction.current = null; }
    }, [closing]);
    const run = (action: () => void) => {
        if (closing || pendingAction.current) return;
        pendingAction.current = action;
        onClose();
    };
    const finishClose = useCallback(() => {
        if (!closingRef.current || completed.current) return;
        completed.current = true;
        const action = pendingAction.current;
        pendingAction.current = null;
        onClosed?.();
        action?.();
    }, [onClosed]);
    useEffect(() => {
        // Reopening reverses the motion and cancels the previous pending navigation.
        if (!closing) { completed.current = false; pendingAction.current = null; return; }
        // Some car WebViews never deliver the exit completion. Bound the wait without
        // changing the animation, and share its exactly-once action guard.
        const timer = window.setTimeout(finishClose, (reduced ? 0 : TY_DURATION.popupExit * 1000) + 120);
        return () => window.clearTimeout(timer);
    }, [closing, reduced, finishClose]);
    // Motion 完成退场后摘除，closing 和 completed 防止入场/重复回调执行动作。
    // Android + Compose 桥可用时，这四个工具都开**原生页**（第 11 轮）；否则回退原 WebView 弹窗。
    // 原生页不占 WebView，也不触发极简页让位 —— 弹窗被遮挡/双开那类问题从根上消失。
    const runNative = (page: 'quality' | 'effects' | 'lyrics', fallback: () => void) => {
        run(() => { void openNativeToolPage(page).then(handled => { if (!handled) fallback(); }); });
    };
    return (
        <motion.div
            initial={{ opacity: reduced ? 1 : 0, scale: reduced ? 1 : .9, y: reduced ? 0 : -6 }}
            animate={{ opacity: closing ? 0 : 1, scale: closing ? .94 : 1, y: closing ? -4 : 0 }}
            transition={reduced ? { duration: 0 } : closing ? { duration: TY_DURATION.popupExit } : TY_SPRING.panel}
            style={{ animation: 'none', transformOrigin: 'top right' }}
            ref={ref}
            role="menu"
            aria-label={t('mobileStage.more')}
            data-folia-keyboard-window="true"
            data-native-chrome-overlay="nonblocking"
            className={`mps-menu${closing ? ' mps-menu--closing' : ''}`}
            onAnimationComplete={target => {
                if (typeof target === 'object' && !Array.isArray(target) && target.opacity === 0) finishClose();
            }}
        >
            <button role="menuitem" onPointerDown={warmSettingsModule} onClick={() => run(() => openSettings('options', 'visualizer', 'visualizer'))}>
                <Palette size={18} />
                {t('mobileStage.stageAppearance')}
            </button>
            <button role="menuitem" onClick={() => runNative('quality', () => useAudioToolsStore.getState().show())}>
                <AudioLines size={18} />
                <span className="mps-menu-label">{t('mobileStage.audioQuality')}</span>
                <span className="mps-menu-value">{QUALITY_LABELS[quality]}</span>
            </button>
            <button role="menuitem" onClick={() => runNative('effects', () => useAudioSettingsStore.getState().openAudioEqualizer())}>
                <SlidersHorizontal size={18} />
                <span className="mps-menu-label">{t('mobileStage.audioEffects')}</span>
                <span className="mps-menu-value">{t(effectsEnabled ? 'mobileStage.effectsOn' : 'mobileStage.effectsOff')}</span>
            </button>
            <button role="menuitem" onClick={() => runNative('lyrics', () => { const state=useAppViewStore.getState();state.setPanelTab('onlineLyrics');state.setIsPanelOpen(true); })}>
                <Captions size={18} />
                {t('mobileStage.lyricsTools')}
            </button>
            {/* Both player views open the existing shared queue panel. */}
            <button role="menuitem" onClick={() => run(() => { void openNativeSleepTimer().then(handled => {
                if (!handled) useSleepTimerStore.setState({ sleepTimerSheetOpen: true });
            }); })}>
                <AlarmClock size={18} />
                {t('mobileStage.sleepTimer')}
            </button>
            <button role="menuitem" onClick={() => run(() => { void openNativeQueueSheet().then(handled => { if (handled) return; const state=useAppViewStore.getState();state.setPanelTab('queue');state.setIsPanelOpen(true); }); })}>
                <PlayerControlIcon kind="queue" size={18} />
                {t('mobileStage.queueMenu')}
            </button>
            <button role="menuitem" onPointerDown={warmSettingsModule} onClick={() => run(() => openSettings('options', 'playback'))}>
                <Settings2 size={18} />
                {t('mobileStage.playbackSettings')}
            </button>
        </motion.div>
    );
}

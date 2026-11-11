import React, { useEffect, useRef } from 'react';
import { AudioLines, Captions, Moon, Palette, Settings2, SlidersHorizontal } from 'lucide-react';
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
    /** true = 正在播 120ms 退场动画；播完回调 onClosed，由宿主摘除。 */
    closing = false,
    onClosed,
}: {
    onClose: () => void;
    closing?: boolean;
    onClosed?: () => void;
}) {
    const { t } = useTranslation();
    const quality = useAudioSettingsStore(state => state.audioQuality);
    const effectsEnabled = useAudioSettingsStore(state => state.audioEqualizerSettings.enabled);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
        const outside = (event: PointerEvent) => {
            if ((event.target as Element)?.closest?.('[data-mps-more], [data-min-more]')) return;
            if (!ref.current?.contains(event.target as Node)) onClose();
        };
        const key = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onClose();
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
        const nativeInteraction=()=>onClose();
        window.addEventListener('tingyu-native-chrome-interaction',nativeInteraction);
        return () => {
            document.removeEventListener('pointerdown', outside, true);
            document.removeEventListener('keydown', key, true);
            window.removeEventListener('tingyu-native-chrome-interaction',nativeInteraction);
            previous?.isConnected && previous.focus();
        };
    }, [onClose]);
    const run = (action: () => void) => {
        onClose();
        action();
    };
    // 退场动画结束后通知宿主摘除：onAnimationEnd 对入场动画也会触发，
    // 只在 closing 时响应，且只认菜单根元素自己的动画结束事件。
    // Android + Compose 桥可用时，这四个工具都开**原生页**（第 11 轮）；否则回退原 WebView 弹窗。
    // 原生页不占 WebView，也不触发极简页让位 —— 弹窗被遮挡/双开那类问题从根上消失。
    const runNative = (page: 'quality' | 'effects' | 'lyrics', fallback: () => void) => {
        onClose();
        void openNativeToolPage(page).then(handled => { if (!handled) fallback(); });
    };
    return (
        <div
            ref={ref}
            role="menu"
            aria-label={t('mobileStage.more')}
            data-folia-keyboard-window="true"
            data-native-chrome-overlay="nonblocking"
            className={`mps-menu${closing ? ' mps-menu--closing' : ''}`}
            onAnimationEnd={(event) => {
                if (closing && event.target === event.currentTarget) onClosed?.();
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
                <Moon size={18} />
                {t('mobileStage.sleepTimer')}
            </button>
            <button role="menuitem" onClick={() => run(() => { void openNativeQueueSheet().then(handled => { if (handled) return; const state=useAppViewStore.getState();state.setPanelTab('queue');state.setIsPanelOpen(true); }); })}>
                <PlayerControlIcon kind="queue" size={18} />
                {t('mobileStage.queueMenu')}
            </button>
            <button role="menuitem" onClick={() => run(() => openSettings('options', 'playback'))}>
                <Settings2 size={18} />
                {t('mobileStage.playbackSettings')}
            </button>
        </div>
    );
}

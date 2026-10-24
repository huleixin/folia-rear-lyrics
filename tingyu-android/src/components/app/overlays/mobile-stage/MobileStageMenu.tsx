import React, { useEffect, useRef } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppViewStore } from '../../../../stores/useAppViewStore';
import { openSettings } from '../../../../stores/useSettingsModalStore';

// src/components/app/overlays/mobile-stage/MobileStageMenu.tsx
export default function MobileStageMenu({
    onClose,
}: {
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
        const outside = (event: PointerEvent) => {
            if ((event.target as Element)?.closest?.('[data-mps-more]')) return;
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
        return () => {
            document.removeEventListener('pointerdown', outside, true);
            document.removeEventListener('keydown', key, true);
            previous?.isConnected && previous.focus();
        };
    }, [onClose]);
    const run = (action: () => void) => {
        onClose();
        action();
    };
    return (
        <div
            ref={ref}
            role="menu"
            aria-label={t('mobileStage.more')}
            data-folia-keyboard-window="true"
            className="mps-menu"
        >
            <button role="menuitem" onClick={() => run(() => { const state=useAppViewStore.getState();state.setPanelTab('onlineLyrics');state.setIsPanelOpen(true); })}>
                <SlidersHorizontal size={18} />
                {t('localMusic.lyrics')}
            </button>
            <button role="menuitem" onClick={() => run(() => openSettings('options', 'playback'))}>
                <SlidersHorizontal size={18} />
                {t('mobileStage.audioSettings')}
            </button>
        </div>
    );
}

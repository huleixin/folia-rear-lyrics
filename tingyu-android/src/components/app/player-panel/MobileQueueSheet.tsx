import React, { useEffect, useRef } from 'react';
import { X, Music2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import QueueTab from '../../panelTab/QueueTab';
import type { PlayerPanelViewModel } from './buildPlayerPanelModel';
import { colorWithAlpha } from '../../visualizer/colorMix';
import './mobileQueueSheet.css';
import { canSaveQueueAsLocalPlaylist } from '../../../utils/queueReorder';

// src/components/app/player-panel/MobileQueueSheet.tsx
export default function MobileQueueSheet({ model }: { model: PlayerPanelViewModel }) {
    const { t } = useTranslation();
    const { playback, queue, account } = model.panelProps;
    const surface = useRef<HTMLElement>(null);
    useEffect(() => {
        const before = document.activeElement as HTMLElement | null;
        const key = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); playback.onToggle(); }
            if (event.key === 'Tab') {
                const focusable = Array.from(surface.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]') ?? []).filter(node => node.getClientRects().length);
                const first = focusable[0], last = focusable.at(-1);
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
        };
        window.addEventListener('keydown', key, true);
        return () => { window.removeEventListener('keydown', key, true); before?.isConnected && before.focus(); };
    }, [playback.onToggle]);
    return <div className="mobile-queue-scrim" data-folia-keyboard-window="true" onClick={playback.onToggle}>
        <section ref={surface} role="dialog" aria-modal="true" aria-label={t('queue.title')} className="mobile-queue-sheet"
            style={{ color: playback.theme.primaryColor, background: colorWithAlpha(playback.theme.backgroundColor, .94) }}
            onClick={event => event.stopPropagation()}>
            <span className="mobile-sheet-handle" />
            <header><Music2 size={22} /><strong>{playback.currentSong?.name || t('queue.title')}</strong>
                <button onClick={playback.onToggle} aria-label={t('ui.close')} autoFocus><X size={22} /></button></header>
            <QueueTab {...queue} currentSong={playback.currentSong} shouldScrollToCurrent isDaylight={account.isDaylight}
                canSaveLocalPlaylist={canSaveQueueAsLocalPlaylist(playback.currentSong, queue.playQueue)} />
        </section>
    </div>;
}

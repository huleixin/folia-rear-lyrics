import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Music2 } from 'lucide-react';
import type { UnifiedPanelProps } from '../UnifiedPanel';
import QueueTab from '../panelTab/QueueTab';
import MobileLyricsTools from './MobileLyricsTools';
import MobileSongTools from './MobileSongTools';
import { useMobileToolsText } from './useMobileToolsText';
import { canSaveQueueAsLocalPlaylist } from '../../utils/queueReorder';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import './mobilePlayerSheet.css';

// src/components/mobile-player/MobilePlayerSheet.tsx
// A touch-first sheet; legacy tab ids only select a destination, never mount a desktop panel.
export default function MobilePlayerSheet(props: UnifiedPanelProps) {
    const { playback: p, queue: q, library: lib } = props;
    const text = useMobileToolsText();
    const ref = useRef<HTMLElement>(null);
    const closeRef = useRef(p.onToggle);
    closeRef.current = p.onToggle;
    const tab = p.currentTab === 'queue' ? 'queue' : ['local', 'navi', 'onlineLyrics'].includes(p.currentTab) ? 'lyrics' : 'song';
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        ref.current?.focus();
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current(); }
            if (e.key !== 'Tab') return;
            const nodes = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary') ?? [])].filter(n => n.getClientRects().length);
            if (!nodes.length) return;
            if (e.shiftKey && (document.activeElement === nodes[0] || document.activeElement === ref.current)) { e.preventDefault(); nodes.at(-1)?.focus(); }
            else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0].focus(); }
        };
        document.addEventListener('keydown', key, true);
        return () => { document.removeEventListener('keydown', key, true); if (previous?.isConnected) previous.focus(); };
    }, []);
    // A song change resets child drafts and cancels pending file reads in the old tools.
    const songKey = p.currentSong ? getPlaybackSongKey(p.currentSong) : 'empty';
    return createPortal(<div className="ty-sheet-scrim" data-testid="mobile-player-sheet" onClick={e => { if (e.target === e.currentTarget) p.onToggle(); }}>
        <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={text.title} data-folia-keyboard-window="true" className="ty-sheet" data-light={props.account.isDaylight || undefined}>
            <div className="ty-sheet-grip" aria-hidden="true" />
            <header className="ty-sheet-header"><div><small>{text.title}</small><h2>{p.currentSong?.name || text.noSong}</h2></div><button className="ty-icon" aria-label={text.close} onClick={p.onToggle}><X size={22} /></button></header>
            <nav className="ty-tabs" aria-label={text.sections}>{(['song','lyrics','queue'] as const).map(id => <button key={id} aria-pressed={tab === id} onClick={() => p.onTabChange(id === 'lyrics' ? 'onlineLyrics' : id === 'song' ? 'cover' : 'queue')}>{text[id]}</button>)}</nav>
            <div className="ty-sheet-body" key={songKey + tab}>
                {tab === 'queue' ? <QueueTab playQueue={q.playQueue} currentSong={p.currentSong} onPlaySong={q.onPlaySong} queueScrollRef={q.queueScrollRef} shouldScrollToCurrent onShuffle={q.onShuffle} onRemoveSong={q.onRemoveSong} onMoveSongToEnd={q.onMoveSongToEnd} onMoveSongToNext={q.onMoveSongToNext} canSaveLocalPlaylist={canSaveQueueAsLocalPlaylist(p.currentSong,q.playQueue)} onSaveCurrentQueueAsPlaylist={lib.onSaveCurrentQueueAsPlaylist} isDaylight={props.account.isDaylight} /> : p.currentSong ? tab === 'lyrics' ? <MobileLyricsTools playback={p} /> : <MobileSongTools {...props} /> : <div className="ty-empty"><Music2 size={32}/><p>{text.noSong}</p></div>}
            </div>
        </section>
    </div>, document.body);
}

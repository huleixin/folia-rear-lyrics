import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { List, type RowComponentProps } from 'react-window';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LibraryHomeCard } from '../../core/contracts/homeModel';
import MobileArtwork from './MobileArtwork';
import MobileScrollFrame from './MobileScrollFrame';
import { canSortDirectoryByUpdate, directoryRows, type DirectorySort } from './mobileDirectoryModel';

// src/library/suites/mobile/MobileDirectory.tsx
type DirectoryProps = {
    cards: LibraryHomeCard[]; onOpen: (card: LibraryHomeCard, index: number) => void;
    alwaysShowFilter?: boolean; heading?: string; enableSort?: boolean; emptyMessage?: string; restoreKey?: string;
    fillBehindFooter?: boolean;
};
type DirectoryRows = Pick<DirectoryProps, 'cards' | 'onOpen'> & { bottomClearance: number };
const directoryRowHeight = (index: number, props: DirectoryRows) => index === props.cards.length ? props.bottomClearance : 72;
export function MobileCardRow({ card, onOpen }: { card: LibraryHomeCard; onOpen: () => void }) {
    const { t } = useTranslation();
    return (
        <button className="ml-card-row" onClick={onOpen}>
            <MobileArtwork src={card.coverUrl} />
            <span>
                <strong>{card.name}</strong>
                <small>
                    {card.trackCount != null
                        ? t('mobileLibrary.trackCount', { count: card.trackCount })
                        : card.description}
                </small>
            </span>
            <ChevronRight size={17} />
        </button>
    );
}
function DirectoryRow({ index, style, cards, onOpen, ariaAttributes }: RowComponentProps<DirectoryRows>) {
    if (index === cards.length) return <div style={style} aria-hidden="true" data-ml-footer-clearance="true" />;
    return (
        <div {...ariaAttributes} aria-setsize={cards.length} style={style}>
            <MobileCardRow card={cards[index]} onOpen={() => onOpen(cards[index], index)} />
        </div>
    );
}
export default function MobileDirectory(props: DirectoryProps) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<DirectorySort>('source');
    const [bottomClearance, setBottomClearance] = useState(0);
    const canSortUpdated = useMemo(() => canSortDirectoryByUpdate(props.cards), [props.cards]);
    const activeSort = sort === 'updated' && !canSortUpdated ? 'source' : sort;
    const shellRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const shell = shellRef.current;
        if (!shell) return;
        let footer: HTMLElement | null = null;
        // Keep the library scrollport full height behind the floating glass bars. Its measured
        // overlap becomes an internal virtualized tail, so the last real row can scroll above them.
        const measure = () => {
            if (!footer) return;
            const overlap = shell.getBoundingClientRect().bottom - footer.getBoundingClientRect().top;
            const clearance = Math.max(0, Math.ceil(overlap + 8));
            if (props.fillBehindFooter) setBottomClearance(clearance);
            else shell.style.setProperty('--ml-directory-bottom-clearance', `${clearance}px`);
        };
        const resize = new ResizeObserver(measure);
        resize.observe(shell);
        const connect = () => {
            footer = document.querySelector<HTMLElement>('.ml-footer');
            if (!footer) return false;
            resize.observe(footer);
            measure();
            return true;
        };
        const mounted = new MutationObserver(() => {
            if (connect()) mounted.disconnect();
        });
        if (!connect()) mounted.observe(document.body, { childList: true, subtree: true });
        window.visualViewport?.addEventListener('resize', measure);
        window.addEventListener('resize', measure);
        return () => {
            resize.disconnect();
            mounted.disconnect();
            window.visualViewport?.removeEventListener('resize', measure);
            window.removeEventListener('resize', measure);
        };
    }, [props.fillBehindFooter]);
    const filtered = useMemo(() => directoryRows(props.cards, query, activeSort), [props.cards, query, activeSort]);
    const rows = useMemo(
        () => ({
            cards: filtered.map((item) => item.card),
            onOpen: (card: LibraryHomeCard, index: number) => props.onOpen(card, filtered[index].index),
            bottomClearance: props.fillBehindFooter ? bottomClearance : 0,
        }),
        [filtered, props.onOpen, props.fillBehindFooter, bottomClearance]
    );
    return (
        <div className="ml-directory-shell" ref={shellRef} data-fill-behind-footer={props.fillBehindFooter || undefined}>
            {(props.alwaysShowFilter || props.cards.length > 8 || query) && (
                <label className="ml-filter">
                    <Search size={17} />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t('mobileLibrary.filterLibrary')}
                        aria-label={t('mobileLibrary.filterLibrary')}
                    />
                </label>
            )}
            {props.heading && <div className="ml-directory-heading">
                <h2>{props.heading}</h2>
                {props.enableSort && <label className="ml-directory-sort">
                    <select aria-label={t('mobileLibrary.directorySort')} value={activeSort}
                        onChange={event => setSort(event.target.value as DirectorySort)}>
                        <option value="source">{t('mobileLibrary.sourceOrder')}</option>
                        {canSortUpdated && <option value="updated">{t('mobileLibrary.recentlyUpdated')}</option>}
                        <option value="name">{t('mobileLibrary.nameOrder')}</option>
                    </select><ChevronDown size={14} aria-hidden="true" />
                </label>}
            </div>}
            {!filtered.length && <p className="ml-empty" role="status">{query ? t('mobileLibrary.noResults') : props.emptyMessage}</p>}
            <MobileScrollFrame fill restoreKey={props.restoreKey ? `${props.restoreKey}:${activeSort}:${query}` : undefined}>
                <List
                    className="ml-directory"
                    rowComponent={DirectoryRow}
                    rowProps={rows}
                    rowCount={rows.cards.length + (rows.cards.length > 0 && rows.bottomClearance > 0 ? 1 : 0)}
                    rowHeight={props.fillBehindFooter ? directoryRowHeight : 72}
                    overscanCount={5}
                    style={{ height: '100%', width: '100%' }}
                />
            </MobileScrollFrame>
        </div>
    );
}

import type { LibraryHomeCard } from '../../core/contracts/homeModel';

// src/library/suites/mobile/mobileDirectoryModel.ts
export type DirectorySort = 'source' | 'updated' | 'name';

// Only canonical timestamps supplied by the provider count; creation time is not update time.
export function directoryUpdatedAt(card: LibraryHomeCard): number | null {
    const raw = card.raw as { updatedAt?: number; tracksUpdatedAt?: number } | undefined;
    const value = raw?.tracksUpdatedAt ?? raw?.updatedAt;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
    return value < 1e12 ? value * 1000 : value;
}
export function canSortDirectoryByUpdate(cards: LibraryHomeCard[]): boolean {
    return cards.length > 0 && cards.every(card => directoryUpdatedAt(card) !== null);
}
export function directoryRows(cards: LibraryHomeCard[], query: string, sort: DirectorySort) {
    const keyword = query.trim().toLocaleLowerCase();
    const rows = cards.map((card, index) => ({ card, index })).filter(({ card }) =>
        !keyword || `${card.name} ${card.description || ''}`.toLocaleLowerCase().includes(keyword));
    if (sort === 'name') rows.sort((a, b) => a.card.name.localeCompare(b.card.name, 'zh-CN') || a.index - b.index);
    if (sort === 'updated' && canSortDirectoryByUpdate(cards)) {
        rows.sort((a, b) => directoryUpdatedAt(b.card)! - directoryUpdatedAt(a.card)! || a.index - b.index);
    }
    return rows;
}

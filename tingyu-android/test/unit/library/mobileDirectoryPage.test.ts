// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryHomeCard } from '@/library/core/contracts/homeModel';
import MobileDirectory from '@/library/suites/mobile/MobileDirectory';
import { canSortDirectoryByUpdate, directoryRows, directoryUpdatedAt } from '@/library/suites/mobile/mobileDirectoryModel';

// test/unit/library/mobileDirectoryPage.test.ts
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cards: LibraryHomeCard[] = [
    { id: 'a', name: '晨间', trackCount: 3, raw: { updatedAt: 1700000000 } },
    { id: 'b', name: '晚间', trackCount: 9, description: '钢琴', raw: { tracksUpdatedAt: 1800000000000 } },
];
let host: HTMLDivElement, root: Root;
beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(0), 0));
    vi.stubGlobal('cancelAnimationFrame', clearTimeout);
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe('truthful library filtering and sorting', () => {
    it('normalizes seconds/milliseconds, never uses creation time as update time', () => {
        expect(directoryUpdatedAt(cards[0])).toBe(1700000000000);
        expect(directoryUpdatedAt(cards[1])).toBe(1800000000000);
        expect(directoryUpdatedAt({ id: 'x', name: 'x', raw: { createdAt: 1800000000000 } })).toBeNull();
        expect(canSortDirectoryByUpdate([...cards, { id: 'unknown', name: 'Unknown' }])).toBe(false);
    });
    it('sorts only reliable dates and preserves the original index for collection actions', () => {
        expect(directoryRows(cards, '', 'updated').map(row => row.index)).toEqual([1, 0]);
        expect(directoryRows(cards, '钢琴', 'name')).toEqual([{ card: cards[1], index: 1 }]);
        expect(directoryRows(cards, '', 'source').map(row => row.card)).toEqual(cards);
    });
    it('keeps the source order when an update timestamp is absent', () => {
        const partial = [{ ...cards[0], raw: undefined }, cards[1]];
        expect(directoryRows(partial, '', 'updated').map(row => row.index)).toEqual([0, 1]);
    });
    it('always renders the internal filter for a small or empty library', () => {
        act(() => root.render(h(MobileDirectory, { cards: [], alwaysShowFilter: true, heading: '我的歌单', enableSort: true, emptyMessage: '暂无歌单', onOpen: vi.fn() })));
        expect(host.querySelector('input')?.placeholder).toBe('mobileLibrary.filterLibrary');
        expect(host.textContent).toContain('暂无歌单');
        expect(host.querySelector('option[value="updated"]')).toBeNull();
    });
    it('filters locally and opens the original collection index after sorting', () => {
        const onOpen = vi.fn();
        act(() => root.render(h(MobileDirectory, { cards, alwaysShowFilter: true, heading: '我的歌单', enableSort: true, onOpen })));
        const select = host.querySelector('select')!;
        act(() => { select.value = 'updated'; select.dispatchEvent(new Event('change', { bubbles: true })); });
        act(() => host.querySelector<HTMLButtonElement>('.ml-card-row')!.click());
        expect(onOpen).toHaveBeenCalledWith(cards[1], 1);
        expect(cards.map(card => card.id)).toEqual(['a', 'b']);
    });
    it('reserves only directory overlap with the actual original footer', () => {
        const footer = document.createElement('div'); footer.className = 'ml-footer'; document.body.appendChild(footer);
        vi.spyOn(footer, 'getBoundingClientRect').mockReturnValue({ top: 600 } as DOMRect);
        const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) { return { top: 0, bottom: this.classList.contains('ml-directory-shell') ? 800 : 0 } as DOMRect; });
        act(() => root.render(h(MobileDirectory, { cards, onOpen: vi.fn(), alwaysShowFilter: true })));
        expect(host.querySelector<HTMLElement>('.ml-directory-shell')!.style.getPropertyValue('--ml-directory-bottom-clearance')).toBe('208px');
        expect(footer.style.cssText).toBe('');
        footer.remove(); rect.mockRestore();
    });
    it('keeps library footer clearance inside the virtual scroll extent instead of shrinking the viewport', () => {
        const footer = document.createElement('div'); footer.className = 'ml-footer'; document.body.appendChild(footer);
        let footerTop = 600;
        vi.spyOn(footer, 'getBoundingClientRect').mockImplementation(() => ({ top: footerTop } as DOMRect));
        const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
            return { top: 0, bottom: this.classList.contains('ml-directory-shell') ? 800 : 0 } as DOMRect;
        });
        try {
            act(() => root.render(h(MobileDirectory, { cards, onOpen: vi.fn(), fillBehindFooter: true })));
            const shell = host.querySelector<HTMLElement>('.ml-directory-shell')!;
            const list = host.querySelector<HTMLElement>('.ml-directory')!;
            expect(shell.dataset.fillBehindFooter).toBe('true');
            expect(shell.style.getPropertyValue('--ml-directory-bottom-clearance')).toBe('');
            expect(host.querySelector<HTMLElement>('[data-ml-footer-clearance]')!.style.height).toBe('208px');
            expect((list.lastElementChild as HTMLElement).style.height).toBe('352px');
            expect(host.querySelectorAll('.ml-card-row')).toHaveLength(2);
            expect(host.querySelector('[role="listitem"]')?.getAttribute('aria-setsize')).toBe('2');
            footerTop = 680;
            act(() => window.dispatchEvent(new Event('resize')));
            expect(host.querySelector<HTMLElement>('[data-ml-footer-clearance]')!.style.height).toBe('128px');
            expect((list.lastElementChild as HTMLElement).style.height).toBe('272px');
            expect(footer.style.cssText).toBe('');
        } finally { footer.remove(); rect.mockRestore(); }
    });
    it('does not create a fake card or a footer row for empty library results', () => {
        act(() => root.render(h(MobileDirectory, { cards: [], fillBehindFooter: true, onOpen: vi.fn(), emptyMessage: '暂无歌单' })));
        expect(host.textContent).toContain('暂无歌单');
        expect(host.querySelectorAll('.ml-card-row')).toHaveLength(0);
        expect(host.querySelector('[data-ml-footer-clearance]')).toBeNull();
    });
    it('keeps long libraries virtualized and opens the correct last real collection before the tail', () => {
        const large = Array.from({ length: 1000 }, (_, index) => ({ id: String(index), name: `歌单 ${index}`, trackCount: index }));
        const footer = document.createElement('div'); footer.className = 'ml-footer'; document.body.appendChild(footer);
        vi.spyOn(footer, 'getBoundingClientRect').mockReturnValue({ top: 600 } as DOMRect);
        const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
            return { top: 0, bottom: this.classList.contains('ml-directory-shell') ? 800 : 0 } as DOMRect;
        });
        const onOpen = vi.fn();
        try {
            act(() => root.render(h(MobileDirectory, { cards: large, fillBehindFooter: true, onOpen })));
            expect(host.querySelectorAll('.ml-card-row').length).toBeLessThan(20);
            const list = host.querySelector<HTMLElement>('.ml-directory')!;
            act(() => { list.scrollTop = 72000; list.dispatchEvent(new Event('scroll')); });
            // react-window estimates unseen rows; the measured tail becomes exact when reached.
            expect((list.lastElementChild as HTMLElement).style.height).toBe('72208px');
            const last = [...host.querySelectorAll<HTMLButtonElement>('.ml-card-row')].find(button => button.textContent?.includes('歌单 999'))!;
            expect(last).toBeDefined();
            act(() => last.click());
            expect(onOpen).toHaveBeenCalledWith(large[999], 999);
            expect(host.querySelector('[data-ml-footer-clearance] .ml-card-row')).toBeNull();
        } finally { footer.remove(); rect.mockRestore(); }
    });
});

// @vitest-environment jsdom
import React, { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import AppDialogs from '@/components/app/dialogs/AppDialogs';
import AppOverlays from '@/components/app/overlays/AppOverlays';
import type { AppDialogsModel } from '@/components/app/dialogs/buildAppDialogsModel';

// test/unit/hooks/startupDialogLoading.test.ts
const loads = vi.hoisted(() => ({ settings: 0, lyrics: 0 }));
const search = vi.hoisted(() => ({ open: false, loads: 0, mounts: 0, unmounts: 0 }));
vi.mock('@/stores/useSearchNavigationStore', () => ({ useSearchNavigationStore: (selector: (state: unknown) => unknown) => selector({ isSearchOpen: search.open }) }));
vi.mock('@/stores/useAppViewStore', () => ({ useAppViewStore: (selector: (state: unknown) => unknown) => selector({ view: 'home' }) }));
vi.mock('@/stores/useLatticeControlsStore', () => ({ useLatticeControlsStore: (selector: (state: unknown) => unknown) => selector({ isCurrentSongPosterVisible: false }) }));
vi.mock('@/library/app/librarySuiteChoice', () => ({ useActiveLibrarySuiteId: () => 'mobile' }));
vi.mock('@/components/FloatingPlayerControls', () => ({ default: () => null }));
vi.mock('@/components/app/overlays/NowPlayingToast', () => ({ default: () => null }));
vi.mock('@/components/app/overlays/BottomCommandPaletteButton', () => ({ default: () => null }));
vi.mock('@/components/app/search/SearchWorkspace', () => {
    search.loads++;
    return { default: () => { React.useEffect(() => { search.mounts++; return () => { search.unmounts++; }; }, []); return h('div', { 'data-test-search': true }); } };
});
vi.mock('@/components/modal/SettingsModal', () => { loads.settings++; return { default: () => h('div', { 'data-test-settings': true }, 'Settings ready') }; });
vi.mock('@/components/modal/LyricMatchModal', () => { loads.lyrics++; return { default: () => h('div', null, 'Lyrics ready') }; });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('mounts the app without loading closed settings/lyric editors, then opens settings on demand', async () => {
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    try {
        await act(async () => root.render(h(AppDialogs, { model: {} })));
        expect(loads).toEqual({ settings: 0, lyrics: 0 });
        await act(async () => root.render(h(AppDialogs, { model: { settingsDialog: {} } as AppDialogsModel })));
        expect(loads.settings).toBe(1); expect(loads.lyrics).toBe(0);
        expect(host.querySelector('[data-test-settings]')?.textContent).toBe('Settings ready');
        await act(async () => root.render(h(AppDialogs, { model: {} })));
        expect(loads.settings).toBe(1);
    } finally { act(() => root.unmount()); host.remove(); }
});

it('does not initialize search on home and retains its close lifecycle after first use', async () => {
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    const render = () => root.render(h(AppOverlays, { model: { searchOverlay: {} } as React.ComponentProps<typeof AppOverlays>['model'] }));
    try {
        await act(async () => render()); expect(search.loads).toBe(0);
        search.open = true; await act(async () => render());
        expect(search.loads).toBe(1); expect(search.mounts).toBe(1);
        search.open = false; await act(async () => render());
        expect(search.unmounts).toBe(0); expect(host.querySelector('[data-test-search]')).not.toBeNull();
    } finally { act(() => root.unmount()); host.remove(); }
    expect(search.unmounts).toBe(1);
});

// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import MobileLibraryStage from '@/library/suites/mobile/MobileLibraryStage';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { useCollectionNavigationStore } from '@/stores/useCollectionNavigationStore';
import { useSearchNavigationStore } from '@/stores/useSearchNavigationStore';
import { useAppViewStore } from '@/stores/useAppViewStore';
import { nativeShellRoute } from '@/utils/nativeShellState';

// test/unit/navigation/mobileLibrarySearchNavigation.test.ts
const chrome = vi.hoisted(() => {
    const entries = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => entries.set(key, String(value)),
        removeItem: (key: string) => entries.delete(key), clear: () => entries.clear(),
    } });
    return { navigate: null as null | ((index: number) => void) };
});
vi.mock('@/hooks/useComposeChrome', () => ({ useComposeChrome: (_ref: unknown, _role: unknown, _active: unknown, _model: unknown, actions: any) => {
    chrome.navigate = actions.navigate; return true;
} }));
vi.mock('@/hooks/useNativeGlassNav', () => ({ useNativeGlassNav: () => false }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('@/hooks/useMobileGlass', () => ({ useMobileGlass: () => {} }));
vi.mock('@/hooks/useReducedMotionFor', () => ({ useReducedMotionFor: () => true }));
vi.mock('@/library/suites/mobile/useMobileFooterMotion', () => ({ useMobileFooterMotion: () => {} }));
vi.mock('@/library/suites/mobile/MobileMiniPlayer', () => ({ default: () => null }));

for (const origin of ['home', 'search'] as const) {
    it(`leaves a playlist opened from ${origin} when the native side rail selects search`, async () => {
        (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
        useCollectionNavigationStore.getState().clear(); useSearchNavigationStore.getState().hideSearchOverlay();
        useAppViewStore.setState({ view: 'home' });
        let navigation: ReturnType<typeof useAppNavigation>;
        function Harness() {
            navigation = useAppNavigation();
            return React.createElement(MobileLibraryStage, {
                isInteractive: true, theme: {} as any, isDaylight: false,
                navigation: { depth: 1, activeType: 'playlist', origin, trail: [] },
                reportPlayerOcclusion: () => {}, reportPlayerBackdrop: () => {}, onBackToPlayer: () => {}, onTogglePlayback: () => {},
                onSearchCommitted: (query, sourceTab) => navigation.navigateToSearch({ query, sourceTab: sourceTab as any }),
            });
        }
        const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
        try {
            await act(async () => root.render(React.createElement(Harness)));
            act(() => {
                if (origin === 'search') navigation!.navigateToSearch({ query: 'old query', sourceTab: 'qq' });
                navigation!.navigateToCollection({ source: 'online', providerId: 'qq', type: 'playlist', id: 'qa', name: 'QA playlist' } as any, origin);
            });
            expect(useCollectionNavigationStore.getState().snapshot).not.toBeNull();
            act(() => chrome.navigate!(2));
            expect(useCollectionNavigationStore.getState().snapshot).toBeNull();
            expect(useSearchNavigationStore.getState().isSearchOpen).toBe(true);
            expect(window.history.state.collection).toBeNull();
            expect(window.history.state.search.query).toBe('');
            expect(window.location.hash).toBe('#search/');
            expect(nativeShellRoute({ settingsOpen: false, settingsIndex: true, searchOpen: true, collectionOpen: false,
                view: useAppViewStore.getState().view, libraryPage: 'home' }).route).toBe('search');
            act(() => chrome.navigate!(2));
            expect(useCollectionNavigationStore.getState().snapshot).toBeNull();
            expect(useSearchNavigationStore.getState().isSearchOpen).toBe(true);
        } finally { await act(async () => root.unmount()); host.remove(); }
    });
}

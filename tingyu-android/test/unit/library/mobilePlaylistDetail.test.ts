// @vitest-environment jsdom
import { act, createElement as h, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionActions } from '../../../src/library/core/bindings/useCollectionActions';
import type { CollectionView } from '../../../src/library/core/bindings/useCollectionView';
import type { LibrarySuiteStageProps } from '../../../src/library/core/contracts/suite';
import type { SongResult } from '../../../src/types';
import { PlayerState } from '../../../src/types';
import MobilePlaylistHeader from '../../../src/library/suites/mobile/MobilePlaylistHeader';
import MobileLibraryStage from '../../../src/library/suites/mobile/MobileLibraryStage';
import MobileTrackList from '../../../src/library/suites/mobile/MobileTrackList';
import { usePlaybackStore } from '../../../src/stores/usePlaybackStore';
import { useMotionSettingsStore } from '../../../src/stores/useMotionSettingsStore';

// test/unit/library/mobilePlaylistDetail.test.ts
// 数据/动作和组件生命周期回归；不把 jsdom 的零尺寸布局当作真机视觉或滚动性能证明。
vi.mock('react-i18next', async importOriginal => ({
    ...await importOriginal<typeof import('react-i18next')>(),
    useTranslation: () => ({ t: (key: string, args?: { count?: number }) => args?.count === undefined ? key : `${key}:${args.count}` }),
}));
vi.mock('../../../src/services/onlineMusic/omni', () => ({ omni: { getProviderLabel: () => 'QQ音乐' } }));
vi.mock('../../../src/hooks/useLiquidGlass', () => ({ useLiquidGlass: () => useRef(null) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(0), 0));
    vi.stubGlobal('cancelAnimationFrame', clearTimeout);
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
    usePlaybackStore.setState({ currentSong: null, playerState: PlayerState.IDLE });
    const motion = useMotionSettingsStore.getState();
    useMotionSettingsStore.setState({ systemPrefersReducedMotion: false, reducedMotionSurfaces: { ...motion.reducedMotionSurfaces, uiMicroMotion: false } });
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const collection = { source: 'online' as const, providerId: 'qq' as const, type: 'playlist', id: 'real-id', name: '很长的真实歌单标题仍然来自资源', coverUrl: '/cover.jpg', trackCount: 397 };
const actions = (): CollectionActions => ({
    capabilities: { scope: { supported: true, enabled: true, pending: false }, reload: { supported: false, enabled: false, pending: false, reason: 'unsupported' } },
    playTrack: vi.fn(), playTrackInFullList: vi.fn(), enqueueTrack: vi.fn(), playScope: vi.fn(), enqueueScope: vi.fn(), reload: vi.fn(), resumeSync: vi.fn(),
});
const song = (id: number): SongResult => ({ id: String(id), name: `Song ${id}`, artists: [{ id: 1, name: 'Artist' }], album: { id: 1, name: 'Album', coverUrl: '/album.jpg' }, durationMs: 200000, sourceRef: { kind: 'online', providerId: 'qq', mediaId: String(id) } });
describe('playlist header preserves truthful metadata and existing actions', () => {
    it('uses provided artwork, creator and description without invented statistics', () => {
        act(() => root.render(h(MobilePlaylistHeader, {
            collection, name: collection.name, count: 397, actions: actions(), canSubscribe: false, subscribeEnabled: false, subscribed: false, onSubscribe: vi.fn(),
            detail: { ...collection, creator: { id: 'owner', nickname: '真实创建者', avatarUrl: '/owner.jpg' }, description: '真实简介' },
        })));
        expect(host.querySelector('h1')?.textContent).toBe(collection.name);
        expect(host.querySelector('.ml-playlist-count')?.textContent).toContain('397');
        expect(host.querySelector('.ml-playlist-creator')?.textContent).toBe('真实创建者');
        expect(host.querySelectorAll('img')).toHaveLength(2);
        expect(host.textContent).toContain('真实简介');
        expect(host.textContent).not.toMatch(/326|1\.2万/);
    });
    it('delegates play, enqueue and subscribe without introducing a second queue', () => {
        const handlers = actions(), save = vi.fn();
        act(() => root.render(h(MobilePlaylistHeader, { collection, name: collection.name, count: 397, actions: handlers, canSubscribe: true, subscribeEnabled: true, subscribed: false, onSubscribe: save })));
        act(() => { host.querySelector<HTMLButtonElement>('.ml-playlist-play')!.click(); host.querySelector<HTMLButtonElement>('[aria-label="mobileLibrary.enqueue"]')!.click(); host.querySelector<HTMLButtonElement>('[aria-label="mobileLibrary.save"]')!.click(); });
        expect(handlers.playScope).toHaveBeenCalledOnce(); expect(handlers.enqueueScope).toHaveBeenCalledOnce(); expect(save).toHaveBeenCalledOnce();
    });
    it('keeps unavailable actions disabled, omits unsupported controls and blank descriptions', () => {
        const handlers = actions(); handlers.capabilities.scope.enabled = false;
        act(() => root.render(h(MobilePlaylistHeader, { collection, name: collection.name, count: 0, actions: handlers, canSubscribe: false, subscribeEnabled: false, subscribed: false, onSubscribe: vi.fn() })));
        expect(host.querySelector('.ml-playlist-description')).toBeNull();
        expect(host.querySelector('.ml-playlist-creator')?.textContent).toBe('QQ音乐');
        expect(host.querySelectorAll('.ml-playlist-auxiliary button')).toHaveLength(1);
        act(() => host.querySelector<HTMLButtonElement>('.ml-playlist-play')!.click());
        expect(handlers.playScope).not.toHaveBeenCalled();
    });
    it('uses a native expandable description and renders untrusted text as text', () => {
        const description = '<img src=x onerror=alert(1)>\n' + '很长的真实描述。'.repeat(20);
        act(() => root.render(h(MobilePlaylistHeader, { collection: { ...collection, description }, name: collection.name, count: 397, actions: actions(), canSubscribe: false, subscribeEnabled: false, subscribed: false, onSubscribe: vi.fn() })));
        expect(host.querySelector('details summary')?.textContent).toBe(description);
        expect(host.querySelector('details img')).toBeNull();
    });
});
describe('playlist chrome and bounded virtual rows', () => {
    const stageProps = (): LibrarySuiteStageProps => ({ isInteractive: true, theme: {} as never, isDaylight: false, navigation: { depth: 0, activeType: null, origin: null }, reportPlayerOcclusion: vi.fn(), reportPlayerBackdrop: vi.fn(), onBackToPlayer: vi.fn(), onTogglePlayback: vi.fn(), onNextTrack: vi.fn(), canNextTrack: true });
    it('hides only playlist navigation while retaining the exact same mini-player element', () => {
        const props = stageProps(); act(() => root.render(h(MobileLibraryStage, props)));
        const mini = host.querySelector('[data-testid="mobile-mini-player"]');
        const nav = host.querySelector('nav');
        expect(nav).not.toBeNull();
        act(() => root.render(h(MobileLibraryStage, { ...props, navigation: { depth: 2, activeType: 'playlist', origin: 'home' } })));
        expect(host.querySelector('nav')).toBe(nav);
        expect(nav?.getAttribute('aria-hidden')).toBe('true'); expect(nav?.hasAttribute('inert')).toBe(true);
        expect(host.querySelector('[data-testid="mobile-mini-player"]')).toBe(mini);
        act(() => root.render(h(MobileLibraryStage, props)));
        expect(host.querySelector('nav')).toBe(nav); expect(nav?.hasAttribute('aria-hidden')).toBe(false); expect(nav?.hasAttribute('inert')).toBe(false);
        expect(host.querySelector('[data-testid="mobile-mini-player"]')).toBe(mini);
    });
    it('keeps original mini-player transport and stage callbacks', () => {
        usePlaybackStore.setState({ currentSong: song(1), playerState: PlayerState.PLAYING });
        const props = stageProps(); props.navigation = { depth: 1, activeType: 'playlist', origin: 'home' };
        act(() => root.render(h(MobileLibraryStage, props)));
        act(() => { host.querySelector<HTMLButtonElement>('.ml-mini-track')!.click(); host.querySelector<HTMLButtonElement>('.ml-mini-toggle')!.click(); host.querySelector<HTMLButtonElement>('.ml-mini-next')!.click(); });
        expect(props.onBackToPlayer).toHaveBeenCalledOnce(); expect(props.onTogglePlayback).toHaveBeenCalledOnce(); expect(props.onNextTrack).toHaveBeenCalledOnce();
        expect(host.querySelectorAll('.ml-mini-controls button')).toHaveLength(2);
    });
    it('does not hide navigation on artist or album pages', () => {
        for (const type of ['artist', 'album', 'folder']) {
            act(() => root.render(h(MobileLibraryStage, { ...stageProps(), navigation: { depth: 1, activeType: type, origin: 'home' } })));
            expect(host.querySelectorAll('nav button')).toHaveLength(4);
        }
    });
    it('keeps the same transport node when the playing song changes during a playlist transition', () => {
        usePlaybackStore.setState({ currentSong: song(1), playerState: PlayerState.PLAYING });
        const props = stageProps(); act(() => root.render(h(MobileLibraryStage, props)));
        const mini = host.querySelector('[data-testid="mobile-mini-player"]');
        act(() => root.render(h(MobileLibraryStage, { ...props, navigation: { depth: 1, activeType: 'playlist', origin: 'home' } })));
        act(() => usePlaybackStore.setState({ currentSong: song(2), playerState: PlayerState.PAUSED }));
        expect(host.querySelector('[data-testid="mobile-mini-player"]')).toBe(mini);
        expect(mini?.textContent).toContain('Song 2');
        act(() => host.querySelector<HTMLButtonElement>('.ml-mini-toggle')!.click());
        expect(props.onTogglePlayback).toHaveBeenCalledOnce();
    });
    it('uses the system reduced-motion signal without changing global follow-system preferences', () => {
        const props = stageProps(); act(() => root.render(h(MobileLibraryStage, props)));
        const mini = host.querySelector<HTMLElement>('.ml-mini')!, nav = host.querySelector<HTMLElement>('nav')!;
        host.querySelector<HTMLElement>('.ml-footer')!.style.rowGap = '6px';
        vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue({ height: 54 } as DOMRect);
        const animation = () => ({ onfinish: null, cancel: vi.fn() } as unknown as Animation);
        mini.animate = vi.fn(animation); nav.animate = vi.fn(animation);
        const preference = useMotionSettingsStore.getState().followSystemReducedMotion;
        act(() => useMotionSettingsStore.setState({ systemPrefersReducedMotion: true }));
        (mini.animate as ReturnType<typeof vi.fn>).mockClear(); (nav.animate as ReturnType<typeof vi.fn>).mockClear();
        act(() => root.render(h(MobileLibraryStage, { ...props, navigation: { depth: 1, activeType: 'playlist', origin: 'home' } })));
        expect(mini.animate).not.toHaveBeenCalled(); expect(mini.style.transform).toBe('translateY(60px)');
        expect(nav.animate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ duration: 60, delay: 0 }));
        expect(useMotionSettingsStore.getState().followSystemReducedMotion).toBe(preference);
    });
    it('virtualizes 2000 tracks and leaves other collection rows free of artwork', () => {
        const tracks = Array.from({ length: 2000 }, (_, index) => song(index));
        const view: CollectionView = { displayTracks: tracks, playableTracks: tracks, contextTracks: tracks, isFilterActive: false, matchIndexes: null, occurrences: new Map(), entryKeyAt: () => null, findEntryIndex: () => -1 };
        const props = { view, sessionKey: 'test-long-playlist', query: '', onPlay: vi.fn(), onMenu: vi.fn() };
        const html = renderToStaticMarkup(h(MobileTrackList, { ...props, showArtwork: true, footer: h('div', { className: 'ml-playlist-tail' }) }));
        expect((html.match(/data-testid="mobile-song-row"/g) ?? []).length).toBeLessThan(30);
        expect(html).toContain('ml-song-art');
        expect(renderToStaticMarkup(h(MobileTrackList, props))).not.toContain('ml-song-art');
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_PALETTE_COMMANDS } from '@/components/command-palette/commandRegistry';
import type { CommandPaletteContext } from '@/components/command-palette/types';
import { resolvePlayerCapsuleNavigationTarget, resolveStartupView, isStartupLatticeDeferred } from '@/hooks/useAppNavigation';
import {
    isPlaybackEntryView,
    resolvePlaybackSurface,
    type PlaybackEntryView,
    type usePlaybackEntryViewStore as StoreHook,
} from '@/stores/usePlaybackEntryViewStore';

// test/unit/stores/playbackEntryViewStore.test.ts
// 「播放后进入的视图」的第三个值「留在原处」（fb3）：存储读回（旧值兼容、未知值回退 player）、持久化、显式进入播放视图时
// stay 去播放页；三条选项命令的 isAvailable / 执行与当前值互斥。store 在 import 时读存储，所以每个用例重新 import 一份。

const ENTRY_VIEW_KEY = 'playback_entry_view';

let storage: Map<string, string>;

const loadStore = async (initial: Record<string, string> = {}): Promise<typeof StoreHook> => {
    vi.resetModules();
    storage = new Map(Object.entries(initial));
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => { storage.set(key, value); },
    });
    return (await import('@/stores/usePlaybackEntryViewStore')).usePlaybackEntryViewStore;
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('playback entry view store', () => {
    it('defaults to the player when nothing is stored', async () => {
        const store = await loadStore();
        expect(store.getState().playbackEntryView).toBe('player');
    });

    

    

    

    // 2026-10-10：首启提问分两页。「资料库界面」那一页每个安装问一次（自己的标记 library_suite_prompt_seen，不看版本）——
    // 回答过旧版单页提问的安装只剩这一页；播放视图那一页仍只看 playback_entry_view_chosen。
    it('opens with the pages still owed, and records both as answered when it closes', async () => {
        const fresh = await loadStore();
        expect(fresh.getState().requestPlaybackEntryViewPrompt({ withLibrarySuite: true })).toBe(true);
        expect(fresh.getState().promptPages).toEqual(['library-suite', 'playback-entry-view']);
        fresh.getState().closePlaybackEntryViewPrompt();
        expect(storage.get('playback_entry_view_chosen')).toBe('true');
        expect(storage.get('library_suite_prompt_seen')).toBe('true');
        expect(fresh.getState().requestPlaybackEntryViewPrompt({ withLibrarySuite: true })).toBe(false);

        const answeredBefore = await loadStore({ playback_entry_view_chosen: 'true' });
        expect(answeredBefore.getState().requestPlaybackEntryViewPrompt({ withLibrarySuite: true })).toBe(true);
        expect(answeredBefore.getState().promptPages).toEqual(['library-suite']);

        // 只有一套 suite 的构建不问界面：答过播放视图就什么都不问。
        const singleSuite = await loadStore({ playback_entry_view_chosen: 'true' });
        expect(singleSuite.getState().requestPlaybackEntryViewPrompt({ withLibrarySuite: false })).toBe(false);
        expect((await loadStore()).getState().requestPlaybackEntryViewPrompt()).toBe(true);
    });

    
});

describe('playback entry view commands', () => {
    const IDS: Partial<Record<PlaybackEntryView, string>> = {
        player: 'playback-entry-view-player',
        stay: 'playback-entry-view-stay',
    };
    const command = (id: string) => {
        const found = COMMAND_PALETTE_COMMANDS.find(candidate => candidate.id === id);
        if (!found) throw new Error(`missing command ${id}`);
        return found;
    };
    const createContext = (state: { view: PlaybackEntryView }) => {
        const setPlaybackEntryView = vi.fn((view: PlaybackEntryView) => { state.view = view; });
        const context = {
            shared: { t: (_key: string, fallback?: string) => fallback ?? '' },
            settings: {
                get playbackEntryView() { return state.view; },
                setPlaybackEntryView,
            },
        } as unknown as CommandPaletteContext;
        return { context, setPlaybackEntryView };
    };

    it('registers one settings command per value, without an execute shortcut', () => {
        for (const id of Object.values(IDS) as string[]) {
            expect(command(id).group).toBe('settings');
            expect(command(id).executeShortcut).toBeUndefined();
        }
    });

    it('offers each value only while it is not the current one', () => {
        for (const current of Object.keys(IDS) as PlaybackEntryView[]) {
            const { context } = createContext({ view: current });
            for (const [value, id] of Object.entries(IDS) as [PlaybackEntryView, string][]) {
                expect(command(id).isAvailable?.(context)).toBe(value !== current);
            }
        }
    });

    
});

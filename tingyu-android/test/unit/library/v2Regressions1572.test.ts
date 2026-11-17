import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import { useSettingsModalStore } from '../../../src/stores/useSettingsModalStore';
import {
    useLibraryOrganization,
    computeEffectivePlatformOrder,
    computeProviderRank,
} from '../../../src/library/core/state/useLibraryOrganization';
import { smartEntryCover } from '../../../src/library/suites/mobile/native/useLibraryInsights';
import type { SongResult } from '../../../src/types';

function makeSong(id: string, coverUrl?: string): SongResult {
    return {
        id,
        name: `Song ${id}`,
        artists: [{ id: 1, name: 'Artist' }],
        album: { id: 1, name: 'Album', ...(coverUrl ? { coverUrl } : {}) },
        durationMs: 180_000,
    };
}

describe('1.5.72 regression fixes', () => {
    beforeEach(() => {
        useSettingsModalStore.getState().closeSettings();
        useLibraryOrganization.setState({
            source: 'all',
            layout: 'list',
            sort: 'source',
            groupByPlatform: true,
            platformOrder: [],
            collapsedGroups: {},
        });
    });

    it('routes settings accounts subview from index and restores index on return', () => {
        const store = useSettingsModalStore.getState();
        store.openSettingsFromIndex('accounts');

        const openState = useSettingsModalStore.getState();
        expect(openState.settingsModalState.isOpen).toBe(true);
        expect(openState.settingsModalState.initialTab).toBe('options');
        expect(openState.settingsModalState.initialSubview).toBe('accounts');
        expect(openState.settingsModalState.returnToIndex).toBe(true);
        expect(openState.isSubSettingsViewOpen).toBe(true);

        openState.returnSettingsToIndex();
        const backState = useSettingsModalStore.getState();
        expect(backState.settingsModalState.isOpen).toBe(true);
        expect(backState.settingsModalState.initialSubview).toBeNull();
        expect(backState.isSubSettingsViewOpen).toBe(false);
    });

    it('uses the first available song cover for smart playlists and falls back cleanly', () => {
        const cover = smartEntryCover([
            { song: makeSong('1', 'https://example.com/a.jpg') },
            { song: makeSong('2', 'https://example.com/b.jpg') },
        ]);
        expect(cover).toBe('https://example.com/a.jpg');

        const fallbackToSecond = smartEntryCover([
            { song: makeSong('1') },
            { song: makeSong('2', 'https://example.com/b.jpg') },
        ]);
        expect(fallbackToSecond).toBe('https://example.com/b.jpg');

        const emptyCover = smartEntryCover([
            { song: makeSong('1') },
            { song: makeSong('2', '') },
        ]);
        expect(emptyCover).toBeUndefined();
    });

    it('preserves saved cold-start platform order even when providers settle asynchronously', () => {
        const saved = ['qq', 'netease', 'kugou'];

        // Before all providers finish settling, only netease may be reported first.
        const earlyRank = computeProviderRank(saved, ['netease']);
        expect(earlyRank.get('qq')).toBe(0);
        expect(earlyRank.get('netease')).toBe(1);
        expect(earlyRank.get('kugou')).toBe(2);

        // Once all providers are available, effective order matches saved order first.
        const order = computeEffectivePlatformOrder(saved, ['netease', 'kugou', 'qq', 'bodian']);
        expect(order).toEqual(['qq', 'netease', 'kugou', 'bodian']);
    });

    it('toggles collapsible group state and exports chevron-up/down native icons', () => {
        const org = useLibraryOrganization.getState();
        expect(org.collapsedGroups.qq).toBeFalsy();
        org.toggleGroup('qq');
        expect(useLibraryOrganization.getState().collapsedGroups.qq).toBe(true);
        org.toggleGroup('smart');
        expect(useLibraryOrganization.getState().collapsedGroups.smart).toBe(true);

        useLibraryOrganization.getState().setAllGroupsCollapsed(['qq', 'netease', 'smart'], false);
        expect(useLibraryOrganization.getState().collapsedGroups.qq).toBe(false);
        expect(useLibraryOrganization.getState().collapsedGroups.smart).toBe(false);

        const iconsPath = path.resolve(process.cwd(), 'android/app/src/main/res/raw/native_page_icons.json');
        const icons = JSON.parse(fs.readFileSync(iconsPath, 'utf8')) as Record<string, unknown>;
        expect(Array.isArray(icons['chevron-up'])).toBe(true);
        expect(Array.isArray(icons['chevron-down'])).toBe(true);
    });
});

import { describe, expect, it, beforeEach } from 'vitest';
import { resolveSettingsOverlayBacking, nativeShellRoute } from '../../src/utils/nativeShellState';
import { useSettingsModalStore } from '../../src/stores/useSettingsModalStore';

describe('resolveSettingsOverlayBacking & nested settings back stack', () => {
    beforeEach(() => {
        useSettingsModalStore.setState({
            isSubSettingsViewOpen: false,
            settingsModalState: {
                isOpen: false,
                initialTab: 'help',
                initialSubview: null,
                initialVisualizerSection: null,
                initialAnchor: null,
            },
        });
    });

    it('keeps settings:document:discovery underneath accounts when entered from DiscoverySettingsPage (never appearance)', () => {
        const store = useSettingsModalStore.getState();
        store.openSettingsFromIndex('discovery');
        expect(resolveSettingsOverlayBacking(useSettingsModalStore.getState().settingsModalState)).toEqual({
            settingsOwnsRoute: true,
            settingsIndex: false,
            pageTarget: 'settings:document:discovery',
        });

        // 从推荐设置进入音乐平台账号
        store.pushSettingsSubview('accounts');
        const accountsState = useSettingsModalStore.getState().settingsModalState;
        const backing = resolveSettingsOverlayBacking(accountsState);
        expect(backing).toEqual({
            settingsOwnsRoute: true,
            settingsIndex: false,
            pageTarget: 'settings:document:discovery',
        });
        expect(backing.pageTarget).not.toContain('appearance');

        // 点击/侧滑返回后回到推荐设置，再返回回到设置首页
        store.returnSettingsToIndex();
        expect(useSettingsModalStore.getState().settingsModalState.initialSubview).toBe('discovery');
        store.returnSettingsToIndex();
        expect(useSettingsModalStore.getState().settingsModalState.initialSubview).toBeNull();
        expect(resolveSettingsOverlayBacking(useSettingsModalStore.getState().settingsModalState).pageTarget).toBe('settings:index');
    });

    it('keeps settings:index underneath accounts when entered directly from Settings Index', () => {
        const store = useSettingsModalStore.getState();
        store.openSettingsFromIndex('accounts');
        const backing = resolveSettingsOverlayBacking(useSettingsModalStore.getState().settingsModalState);
        expect(backing).toEqual({
            settingsOwnsRoute: true,
            settingsIndex: true,
            pageTarget: 'settings:index',
        });
    });

    it('preserves underlying home/library/search route when accounts is opened directly from a browsing page', () => {
        const store = useSettingsModalStore.getState();
        store.openSettings('options', 'accounts');
        const backing = resolveSettingsOverlayBacking(useSettingsModalStore.getState().settingsModalState);
        expect(backing.settingsOwnsRoute).toBe(false);

        const shell = nativeShellRoute({
            settingsOpen: backing.settingsOwnsRoute,
            settingsIndex: backing.settingsIndex,
            searchOpen: false,
            collectionOpen: false,
            view: 'home',
            libraryPage: 'library',
        });
        expect(shell).toEqual({ route: 'home', selectedTab: 1 });
    });

    it('returns directly from integration subview back to discovery without passing through appearance', () => {
        const store = useSettingsModalStore.getState();
        store.openSettingsFromIndex('discovery');
        store.pushSettingsSubview('integration');
        expect(useSettingsModalStore.getState().settingsModalState.initialSubview).toBe('integration');

        store.returnSettingsToIndex();
        expect(useSettingsModalStore.getState().settingsModalState.initialSubview).toBe('discovery');
    });
});

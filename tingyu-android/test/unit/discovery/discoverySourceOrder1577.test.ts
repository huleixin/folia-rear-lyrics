import { describe, expect, it, beforeEach } from 'vitest';
import {
    useDiscoverySettingsStore,
    defaultDiscoverySettings,
    computeDiscoverySourceOrder,
    computeVisibleDiscoverySources,
    resolveEffectiveDiscoverySource,
} from '../../../src/stores/useDiscoverySettingsStore';
import { useLibraryOrganization } from '../../../src/library/core/state/useLibraryOrganization';
import {
    discoverySettingsModel,
    discoverySettingsPatch,
    resetDiscoverySourceOrder,
} from '../../../src/components/modal/settings/discoverySettingsModel';
import { rankDiscovery } from '../../../src/services/discovery/ranking';
import type { SongResult } from '../../../src/types';
import type { OnlineProviderId } from '../../../src/types/onlineMusic';

const ALL_SOURCES = [
    { providerId: 'netease', displayName: '网易云音乐', loggedIn: true },
    { providerId: 'kugou', displayName: '酷狗音乐', loggedIn: false },
    { providerId: 'qq', displayName: 'QQ音乐', loggedIn: true },
    { providerId: 'bodian', displayName: '波点音乐', loggedIn: false },
    { providerId: 'qishui', displayName: '汽水音乐', loggedIn: true },
];

function makeSong(providerId: OnlineProviderId, id: string): SongResult {
    return {
        id,
        name: `Song ${providerId} ${id}`,
        artists: [{ id: `${providerId}:a:${id}`, name: `Artist ${id}` }],
        album: { id: `${providerId}:al:${id}`, name: 'Album' },
        durationMs: 200_000,
        sourceRef: { kind: 'online', providerId, mediaId: id },
    };
}

describe('1.5.77 Discovery source drag-reorder, hiding, and state isolation', () => {
    beforeEach(() => {
        useDiscoverySettingsStore.setState({ ...defaultDiscoverySettings });
        useLibraryOrganization.setState({ platformOrder: ['netease', 'qq'] });
    });

    it('orders visible sources strictly by sourceOrder, hides disabled platforms, and restores position on re-enable', () => {
        const customOrder = ['qq', 'netease', 'qishui', 'kugou', 'bodian'];
        useDiscoverySettingsStore.getState().patch({
            sourceOrder: customOrder,
            enabled: { kugou: false, bodian: false },
            weights: { qq: 2, netease: 1 },
        });

        const state1 = useDiscoverySettingsStore.getState();
        expect(computeVisibleDiscoverySources(ALL_SOURCES, state1).map(s => s.providerId))
            .toEqual(['qq', 'netease', 'qishui']);

        // Re-enable kugou via patch -> returns at index 3 (between qishui and bodian)
        const patch = discoverySettingsPatch(state1, 'sourceOrder', { text: 'toggle:kugou' });
        expect(patch).not.toBeNull();
        useDiscoverySettingsStore.getState().patch(patch!);

        const state2 = useDiscoverySettingsStore.getState();
        expect(computeVisibleDiscoverySources(ALL_SOURCES, state2).map(s => s.providerId))
            .toEqual(['qq', 'netease', 'qishui', 'kugou']);
        expect(state2.weights.qq).toBe(2);
    });

    it('falls back to "all" when the currently selected platform is hidden', () => {
        useDiscoverySettingsStore.getState().patch({ source: 'qq', enabled: { qq: true } });
        const state = useDiscoverySettingsStore.getState();
        const patch = discoverySettingsPatch(state, 'sourceOrder', { text: 'toggle:qq' });
        expect(patch).toEqual({
            enabled: { qq: false },
            source: 'all',
        });
        expect(resolveEffectiveDiscoverySource({ source: 'qq', enabled: { qq: false } })).toBe('all');
    });

    it('builds two-line source model with "已隐藏" status and resets order without touching weights or switches', () => {
        const settings = {
            ...defaultDiscoverySettings,
            sourceOrder: ['qq', 'netease', 'qishui', 'kugou', 'bodian'],
            enabled: { kugou: false },
            weights: { qq: 3 },
        };
        const flow = discoverySettingsModel(settings, ALL_SOURCES);
        const node = flow.nodes.find(n => n.id === 'sourceOrder');
        expect(node?.kind).toBe('sourceOrder');
        expect(node?.hint).toBe('长按右侧手柄调整顺序，关闭开关可隐藏对应推荐来源。');

        const parsed = JSON.parse(node!.value!) as Array<{ id: string; label: string; status: string; enabled: boolean; weight: string }>;
        expect(parsed.map(p => p.id)).toEqual(['qq', 'netease', 'qishui', 'kugou', 'bodian']);
        expect(parsed.find(p => p.id === 'qq')).toMatchObject({ status: '已登录', enabled: true, weight: '3' });
        expect(parsed.find(p => p.id === 'kugou')).toMatchObject({ status: '已隐藏', enabled: false });
        // Label must not contain parenthesized login status
        expect(parsed.every(p => !p.label.includes('（'))).toBe(true);

        // Reset sourceOrder only
        const resetPatch = resetDiscoverySourceOrder();
        const afterReset = { ...settings, ...resetPatch };
        expect(computeDiscoverySourceOrder(afterReset.sourceOrder, ALL_SOURCES.map(s => s.providerId)))
            .toEqual(['netease', 'kugou', 'qq', 'bodian', 'qishui']);
        expect(afterReset.enabled.kugou).toBe(false);
        expect(afterReset.weights.qq).toBe(3);
    });

    it('keeps mixed recommendation algorithm scores independent of sourceOrder and isolated from library platformOrder', () => {
        const candidates = [
            makeSong('netease', '1'),
            makeSong('qq', '2'),
            makeSong('qishui', '3'),
        ];
        const settingsA = { ...defaultDiscoverySettings, sourceOrder: ['netease', 'qq', 'qishui'], weights: { qq: 2, netease: 1 } };
        const settingsB = { ...defaultDiscoverySettings, sourceOrder: ['qishui', 'qq', 'netease'], weights: { qq: 2, netease: 1 } };

        const rankA = rankDiscovery(candidates, {}, settingsA, 'heart', '2026-11-18:0', 1_794_960_000_000, 10);
        const rankB = rankDiscovery(candidates, {}, settingsB, 'heart', '2026-11-18:0', 1_794_960_000_000, 10);
        expect(rankA.map(r => r.song.id)).toEqual(rankB.map(r => r.song.id));

        // Isolation from library platformOrder
        useDiscoverySettingsStore.getState().patch({ sourceOrder: ['qishui', 'qq', 'netease'] });
        expect(useLibraryOrganization.getState().platformOrder).toEqual(['netease', 'qq']);
    });
});

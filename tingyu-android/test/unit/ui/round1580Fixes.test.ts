// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasPersistedSearchSource, useSearchNavigationStore } from '../../../src/stores/useSearchNavigationStore';
import { useSettingsModalStore } from '../../../src/stores/useSettingsModalStore';
import { useDiscoverySettingsStore } from '../../../src/stores/useDiscoverySettingsStore';
import { captureSettingsPageLayout } from '../../../src/services/settingsPageLayout';
import type { NativeSettingsFlowNode } from '../../../src/types/nativeSettingsDocument';
import type { PageActions } from '../../../src/types/nativePages';

describe('Round 1.5.80 UI, State & Navigation Fixes', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('persists manually selected search source and protects it from runtime/provider overwrites', () => {
        expect(hasPersistedSearchSource()).toBe(false);

        const store = useSearchNavigationStore.getState();
        store.selectSearchSource('aggregate');
        expect(hasPersistedSearchSource()).toBe(true);
        expect(localStorage.getItem('tingyu_last_search_source_v1')).toBe('aggregate');
        expect(useSearchNavigationStore.getState().searchSourceTab).toBe('aggregate');

        // Browsing QQ Music elsewhere or calling resetRuntime must NOT reset user's persisted search source
        useSearchNavigationStore.getState().followOnlineProvider('qq');
        expect(useSearchNavigationStore.getState().searchSourceTab).toBe('aggregate');

        useSearchNavigationStore.getState().resetRuntime('qq');
        expect(useSearchNavigationStore.getState().searchSourceTab).toBe('aggregate');

        // User explicitly switches to QQ Music in Search -> persisted as 'qq'
        useSearchNavigationStore.getState().selectSearchSource('qq');
        expect(localStorage.getItem('tingyu_last_search_source_v1')).toBe('qq');
        expect(useSearchNavigationStore.getState().searchSourceTab).toBe('qq');

        useSearchNavigationStore.getState().followOnlineProvider('netease');
        expect(useSearchNavigationStore.getState().searchSourceTab).toBe('qq');
    });

    it('returns from Discovery Settings child subviews (accounts / integration) back to Discovery Settings instead of Settings Index', () => {
        const modal = useSettingsModalStore.getState();
        modal.openSettingsFromIndex('discovery');
        expect(useSettingsModalStore.getState().settingsModalState.initialSubview).toBe('discovery');

        // Enter 音乐平台账号 from 推荐设置
        useSettingsModalStore.getState().pushSettingsSubview('accounts');
        expect(useSettingsModalStore.getState().settingsModalState.initialSubview).toBe('accounts');
        expect(useSettingsModalStore.getState().settingsModalState.subviewBackStack).toHaveLength(1);

        // Press Back -> returns to 推荐设置 ('discovery'), NOT settings index (null)
        useSettingsModalStore.getState().returnSettingsToIndex();
        expect(useSettingsModalStore.getState().settingsModalState.initialSubview).toBe('discovery');
        expect(useSettingsModalStore.getState().isSubSettingsViewOpen).toBe(true);

        // Enter 自定义音源与扩展 from 推荐设置
        useSettingsModalStore.getState().pushSettingsSubview('integration');
        expect(useSettingsModalStore.getState().settingsModalState.initialSubview).toBe('integration');

        // Press Back -> returns to 推荐设置 ('discovery')
        useSettingsModalStore.getState().returnSettingsToIndex();
        expect(useSettingsModalStore.getState().settingsModalState.initialSubview).toBe('discovery');
        expect(useSettingsModalStore.getState().isSubSettingsViewOpen).toBe(true);

        // Press Back again from 推荐设置 -> returns to Settings Index
        useSettingsModalStore.getState().returnSettingsToIndex();
        expect(useSettingsModalStore.getState().settingsModalState.initialSubview).toBeNull();
        expect(useSettingsModalStore.getState().isSubSettingsViewOpen).toBe(false);
    });

    it('synchronizes Discovery Settings source order, enabled state, and local music toggle cleanly', () => {
        const disc = useDiscoverySettingsStore.getState();
        disc.patch({
            sourceOrder: ['qq', 'netease', 'qishui', 'kugou', 'bodian'],
            enabled: { kugou: false, bodian: false },
            includeLocal: false,
        });

        const next = useDiscoverySettingsStore.getState();
        const visiblePlatforms = next.sourceOrder.filter(id => next.enabled[id] !== false);
        expect(visiblePlatforms).toEqual(['qq', 'netease', 'qishui']);
        expect(next.includeLocal).toBe(false);
    });

    it('strips decorative pointer-events-none blur glow elements during native layout capture', () => {
        const host = document.createElement('div');
        host.innerHTML = `
            <div data-settings-page-body data-settings-layout="column">
                <div class="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full blur-[70px]" data-settings-style='{"height":160,"width":160,"radius":64}' data-settings-swatch="#ff8800"></div>
                <p data-settings-layout="column">真实正文内容</p>
            </div>
        `;
        document.body.appendChild(host);
        const nodes: NativeSettingsFlowNode[] = [];
        const actions = { register: () => 'act-1' } as unknown as PageActions;
        const captured = captureSettingsPageLayout(host, nodes, actions);
        document.body.removeChild(host);

        const serialized = JSON.stringify(captured);
        expect(serialized).toContain('真实正文内容');
        expect(serialized).not.toContain('#ff8800');
        expect(serialized).not.toContain('"height":160');
    });
});

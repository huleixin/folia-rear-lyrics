// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativePageModel } from '../../../src/types/nativePages';

// test/unit/library/nativeDirectoryLocalMode.test.ts
// 专项修复：本地资料库顶部仍保留「歌单 / 电台 / 专辑 / 本地」在线导航与 QQ 音乐选择器。
// 这里真实渲染原生页模型生成器，核对本地模式下整行不生成、切回在线后完整恢复。

const captured: { model: NativePageModel | null } = { model: null };
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', async importOriginal => ({
    ...await importOriginal<typeof import('react-i18next')>(),
    useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../src/hooks/useNativePage', () => ({
    useNativePage: (_root: unknown, _id: string, _active: boolean, model: NativePageModel) => {
        captured.model = model;
    },
}));

import NativeDirectoryPage from '../../../src/library/suites/mobile/native/NativeDirectoryPage';
import { useHomeSourceStore } from '../../../src/stores/useHomeSourceStore';

const sources = {
    tab: 'local',
    setTab: vi.fn(),
    isOnlineTab: false,
    online: { providerId: 'qq', providerLabel: 'QQ音乐' },
    tabs: [
        { key: 'playlist', label: '歌单' },
        { key: 'radio', label: '电台' },
        { key: 'albums', label: '专辑' },
        { key: 'local', label: '本地' },
    ],
} as never;

const render = async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    captured.model = null;
    await act(async () => {
        root.render(h(NativeDirectoryPage, {
            root: { current: host },
            props: { isInteractive: true, extraTabs: [] },
            sources,
            onReady: () => {},
            onSources: () => {},
            cards: [],
            onOpen: () => {},
            route: 'local:songs:',
            emptyMessage: '没有歌曲',
        } as never));
    });
    await act(async () => root.unmount());
    host.remove();
    return captured.model!;
};

describe('本地资料库的在线分类导航', () => {
    beforeEach(() => {
        localStorage.clear();
        useHomeSourceStore.setState({ source: 'online' });
    });

    it('本地模式：整行在线导航不生成（不留空白占位），保留切换音源入口', async () => {
        useHomeSourceStore.setState({ source: 'local' });
        const model = await render();
        expect(model.sections.some(section => section.id === 'sources')).toBe(false);
        expect(model.trailing).toBe('sources');
        expect(model.trailingLabel).toBe('mobileLibrary.localMusicSource');
        // 本地资料库自己的分类与搜索框照常保留
        expect(model.sections.some(section => section.id === 'filter')).toBe(true);
    });

    it('在线模式：在线分类恢复，本地音乐通过音源入口切换', async () => {
        const model = await render();
        const tabs = model.sections.find(section => section.id === 'sources');
        expect(tabs?.items?.map(item => item.title)).toEqual(['歌单', '电台', '专辑']);
        expect(model.trailing).toBe('sources');
        expect(model.trailingLabel).toBe('QQ音乐');
    });
});

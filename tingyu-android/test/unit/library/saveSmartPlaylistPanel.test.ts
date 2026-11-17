// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SaveSmartPlaylistPanel from '@/library/suites/mobile/native/SaveSmartPlaylistPanel';
import type { NativePanelModel } from '@/types/nativePanels';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { libraryV2Zh, libraryV2En } from '@/i18n/libraryV2Copy';

// test/unit/library/saveSmartPlaylistPanel.test.ts
let panel: NativePanelModel;
let action: (id: string, payload?: { text: string }) => void;
vi.mock('@/components/shared/OperationPanel', () => ({ default: (props: any) => {
    panel = props.panel; action = props.onAction; return null;
} }));
let root: ReturnType<typeof createRoot>;
const i18n = createInstance();
beforeEach(async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.init({ lng: 'zh-CN', fallbackLng: 'en', resources: {
        'zh-CN': { translation: { libraryV2: libraryV2Zh } }, en: { translation: { libraryV2: libraryV2En } },
    } });
    root = createRoot(document.createElement('div'));
});
const renderPanel = (props: Parameters<typeof SaveSmartPlaylistPanel>[0]) =>
    root.render(createElement(I18nextProvider, { i18n }, createElement(SaveSmartPlaylistPanel, props)));
afterEach(async () => { await act(() => root.unmount()); });
it('saves the ordered local snapshot once while a request is pending', async () => {
    let finish!: (result: { ok: true }) => void;
    const createPlaylist = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const onClose = vi.fn();
    await act(() => renderPanel({ selection: { name: '最近常听', trackIds: ['b', 'a'] }, controller: { createPlaylist } as any, onClose }));
    await act(() => { action('save'); action('save'); });
    expect(createPlaylist).toHaveBeenCalledExactlyOnceWith('最近常听', { items: [], trackIds: ['b', 'a'] });
    expect(panel.busy).toBe(true); expect(onClose).not.toHaveBeenCalled();
    await act(() => finish({ ok: true }));
    expect(onClose).toHaveBeenCalledOnce();
});
it('retains the panel and reports failed persistence without pretending success', async () => {
    const onClose = vi.fn(), createPlaylist = vi.fn(async () => ({ ok: false, reason: 'failed' }));
    await act(() => renderPanel({ selection: { name: '歌单', trackIds: ['a'] }, controller: { createPlaylist } as any, onClose }));
    await act(() => action('save'));
    expect(onClose).not.toHaveBeenCalled(); expect(panel.error).toContain('保存失败');
    expect(panel.busy).toBe(false);
});
it('switches native labels to English while preserving the user playlist name and real count', async () => {
    await act(() => renderPanel({ selection: { name: '我的名字', trackIds: ['a', 'b'] }, onClose: vi.fn() }));
    await act(async () => { await i18n.changeLanguage('en'); });
    expect(panel.title).toBe('Save as a local playlist');
    expect(panel.blocks.find(block => block.id === 'name')).toMatchObject({ value: '我的名字', label: 'Playlist name' });
    expect(panel.blocks.find(block => block.id === 'scope')).toMatchObject({ text: expect.stringContaining('2 local tracks') });
});

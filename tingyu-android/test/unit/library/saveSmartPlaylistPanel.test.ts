// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SaveSmartPlaylistPanel from '@/library/suites/mobile/native/SaveSmartPlaylistPanel';
import type { NativePanelModel } from '@/types/nativePanels';

// test/unit/library/saveSmartPlaylistPanel.test.ts
let panel: NativePanelModel;
let action: (id: string, payload?: { text: string }) => void;
vi.mock('@/components/shared/OperationPanel', () => ({ default: (props: any) => {
    panel = props.panel; action = props.onAction; return null;
} }));
let root: ReturnType<typeof createRoot>;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; root = createRoot(document.createElement('div')); });
afterEach(async () => { await act(() => root.unmount()); });
it('saves the ordered local snapshot once while a request is pending', async () => {
    let finish!: (result: { ok: true }) => void;
    const createPlaylist = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const onClose = vi.fn();
    await act(() => root.render(createElement(SaveSmartPlaylistPanel, { selection: { name: '最近常听', trackIds: ['b', 'a'] }, controller: { createPlaylist } as any, onClose })));
    await act(() => { action('save'); action('save'); });
    expect(createPlaylist).toHaveBeenCalledExactlyOnceWith('最近常听', { items: [], trackIds: ['b', 'a'] });
    expect(panel.busy).toBe(true); expect(onClose).not.toHaveBeenCalled();
    await act(() => finish({ ok: true }));
    expect(onClose).toHaveBeenCalledOnce();
});
it('retains the panel and reports failed persistence without pretending success', async () => {
    const onClose = vi.fn(), createPlaylist = vi.fn(async () => ({ ok: false, reason: 'failed' }));
    await act(() => root.render(createElement(SaveSmartPlaylistPanel, { selection: { name: '歌单', trackIds: ['a'] }, controller: { createPlaylist } as any, onClose })));
    await act(() => action('save'));
    expect(onClose).not.toHaveBeenCalled(); expect(panel.error).toContain('保存失败');
    expect(panel.busy).toBe(false);
});

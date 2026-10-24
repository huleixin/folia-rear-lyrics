// @vitest-environment jsdom
import React, { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCommandPalette } from '@/components/command-palette/useCommandPalette';
import { openCommandPalette, useAppViewStore } from '@/stores/useAppViewStore';
import type { CommandPaletteContext } from '@/components/command-palette/types';

// test/unit/command-palette/androidCommandRoot.test.ts
const actions = vi.hoisted(() => ({ next: vi.fn(async () => true) }));
vi.mock('@/components/command-palette/commandRegistry', () => ({
    COMMAND_PALETTE_COMMANDS: [
        { id: 'next-track', title: 'Next', group: 'playback', keywords: [], execute: actions.next },
        { id: 'volume', title: 'Volume', group: 'playback', keywords: [], requiresInput: true, surface: { presentation: 'modal' } },
    ], isCommandPaletteCommandEnabled: () => true, rankCommands: () => [],
}));
vi.mock('@/components/command-palette/commands', () => ({ OPEN_HOTKEY_INDEX: new Map(), openHotkeyStroke: () => '' }));
vi.mock('@/components/command-palette/search/commandSearchIndex', () => ({ findCommandsByTrigger: () => [] }));
vi.mock('react-i18next', async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(), useTranslation: () => ({ t: (k: string) => k, i18n: { resolvedLanguage: 'en', language: 'en' } }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, api: ReturnType<typeof useCommandPalette>;
const context = { scope: { view: 'player', filter: null, grid: null, directory: null, artist: null, chrome: null },
    shared: { t: (k: string) => k }, playback: {}, navigation: {}, panel: {}, search: {}, settings: {}, visualizer: {} } as unknown as CommandPaletteContext;
function Probe() { api = useCommandPalette({ context, isBlocked: false }); return null; }
beforeEach(() => { vi.clearAllMocks(); Object.defineProperty(window, 'Capacitor', { configurable: true, value: { getPlatform: () => 'android' } });
    useAppViewStore.setState({ commandPaletteRequest: { seq: 0, kind: 'root' } }); root = createRoot(document.createElement('div')); });
afterEach(() => { act(() => root.unmount()); delete (window as unknown as Record<string, unknown>).Capacitor; });
describe('Android removes the generic command root, not business actions', () => {
    it('ignores root requests and Ctrl+K without opening an overlay', () => {
        act(() => root.render(h(Probe))); act(() => openCommandPalette()); expect(api.isOpen).toBe(false);
        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))); expect(api.isOpen).toBe(false);
    });
    it('still executes a real business callback without showing the generic list', () => {
        act(() => root.render(h(Probe))); act(() => api.invokeCommandById('next-track'));
        expect(actions.next).toHaveBeenCalledOnce(); expect(api.isOpen).toBe(false);
    });
    it('retains dedicated surfaces and closes instead of falling back to the removed root', () => {
        act(() => root.render(h(Probe))); act(() => api.openCommandById('volume'));
        expect(api.isOpen).toBe(true); expect(api.activeCommand?.id).toBe('volume');
        act(() => api.setActiveCommand(null)); expect(api.isOpen).toBe(false);
        expect(api.activeCommand).toBeNull();
    });
    it('keeps the generic command root on non-Android builds', () => {
        Object.defineProperty(window, 'Capacitor', { configurable: true, value: { getPlatform: () => 'web' } });
        act(() => root.render(h(Probe))); act(() => api.open()); expect(api.isOpen).toBe(true);
    });
});

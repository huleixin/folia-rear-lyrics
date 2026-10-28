// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
const bridge = vi.hoisted(() => ({ addListener: vi.fn(), getMainWindowInsets: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' }, registerPlugin: () => bridge }));
import { useAndroidMainInsets } from '@/hooks/useAndroidMainInsets';

// test/unit/hooks/androidMainInsets.test.ts
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
const Probe = () => { useAndroidMainInsets(); return null; };
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; vi.resetAllMocks(); });
describe('Android edge-to-edge safe content', () => {
    it('requests initial safe geometry without waiting for listener registration',async()=>{
        bridge.addListener.mockImplementation(()=>new Promise(()=>{}));
        bridge.getMainWindowInsets.mockResolvedValue({top:30,bottom:22,left:0,right:0});
        await act(async()=>{root=createRoot(document.createElement('div'));root.render(React.createElement(Probe))});
        expect(bridge.getMainWindowInsets).toHaveBeenCalledTimes(1);
        expect(document.documentElement.style.getPropertyValue('--folia-main-inset-bottom')).toBe('22px');
    });
    it('uses measured dp insets once, updates on rotation and clears listeners on unmount', async () => {
        let update!: (value: { top: number; bottom: number; left: number; right: number }) => void;
        const remove = vi.fn(async () => {});
        bridge.addListener.mockImplementation(async (_name, listener) => { update = listener; return { remove }; });
        bridge.getMainWindowInsets.mockResolvedValue({ top: 30, bottom: 22, left: 0, right: 0 });
        await act(async () => { root = createRoot(document.createElement('div')); root.render(React.createElement(Probe)); });
        const style = document.documentElement.style;
        expect(style.getPropertyValue('--folia-main-inset-top')).toBe('30px');
        expect(style.getPropertyValue('--folia-main-inset-bottom')).toBe('22px');
        update({ top: 0, bottom: 18, left: 28, right: 0 });
        expect(style.getPropertyValue('--folia-main-inset-left')).toBe('28px');
        act(() => root!.unmount()); root = undefined;
        update({ top: 99, bottom: 99, left: 0, right: 0 });
        expect(style.getPropertyValue('--folia-main-inset-top')).toBe('');
        expect(remove).toHaveBeenCalledTimes(1);
    });
    it('does not overwrite a newer rotation event with an older asynchronous initial response', async () => {
        let update!: (value: { top: number; bottom: number; left: number; right: number }) => void;
        let respond!: (value: { top: number; bottom: number; left: number; right: number }) => void;
        bridge.addListener.mockImplementation(async (_name, listener) => { update = listener; return { remove: async () => {} }; });
        bridge.getMainWindowInsets.mockImplementation(() => new Promise(resolve => { respond = resolve; }));
        await act(async () => { root = createRoot(document.createElement('div')); root.render(React.createElement(Probe)); });
        update({ top: 0, bottom: 18, left: 28, right: 0 });
        await act(async () => { respond({ top: 30, bottom: 22, left: 0, right: 0 }); });
        expect(document.documentElement.style.getPropertyValue('--folia-main-inset-top')).toBe('0px');
        expect(document.documentElement.style.getPropertyValue('--folia-main-inset-left')).toBe('28px');
    });
});

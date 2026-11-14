// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SongResult, VisualizerMode } from '@/types';
import { useRandomVisualizerMode } from '@/hooks/useRandomVisualizerMode';

// test/unit/hooks/randomVisualizerMode.test.ts
const bridge = vi.hoisted(() => ({ select: vi.fn(), android: true }));
const pool: VisualizerMode[] = ['classic', 'hanabi', 'lumiere'];
vi.mock('@/utils/platform', () => ({ isAndroidNativeRuntime: () => bridge.android }));
vi.mock('@/platform/foliaNative', () => ({ getFoliaNative: () => ({ selectSongVisualizerMode: bridge.select }) }));
vi.mock('@/components/visualizer/registry', () => ({ VISUALIZER_REGISTRY: ['classic', 'hanabi', 'lumiere'].map(mode => ({ mode })) }));
vi.mock('@/stores/useVisualizerSettingsStore', () => ({ useVisualizerSettingsStore: (select: any) => select({ randomVisualizerModes: pool }) }));

const song = (id: string, providerId = 'netease') => ({ id, name: id,
    sourceRef: { kind: 'online', providerId, mediaId: id },
}) as unknown as SongResult;
type Props = Parameters<typeof useRandomVisualizerMode>[0];
const setMode = vi.fn();
let root: ReturnType<typeof createRoot>, host: HTMLDivElement, props: Props;
function Harness(value: Props) { useRandomVisualizerMode(value); return null; }
const render = async (next: Partial<Props>) => {
    props = { ...props, ...next };
    await act(async () => root.render(React.createElement(Harness, props)));
};
const deferred = () => {
    let resolve!: (value: { mode: VisualizerMode }) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<{ mode: VisualizerMode }>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
beforeEach(async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    bridge.android = true; bridge.select.mockReset(); setMode.mockReset();
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    props = { currentSong: song('A'), enabled: true, visualizerMode: 'classic', setVisualizerMode: setMode };
    await render({});
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it('applies the native choice when metadata replaces the same song before the bridge replies', async () => {
    const result = deferred(); bridge.select.mockReturnValueOnce(result.promise);
    await render({ currentSong: song('B') });
    await render({ currentSong: { ...song('B'), name: 'Hydrated metadata' } });
    await act(async () => result.resolve({ mode: 'hanabi' }));
    expect(bridge.select).toHaveBeenCalledTimes(1);
    expect(setMode).toHaveBeenCalledExactlyOnceWith('hanabi', { notify: false });
    await render({ visualizerMode: 'hanabi' });
    expect(bridge.select).toHaveBeenCalledTimes(1);
});

it('ignores a late result from a previous song during rapid skipping', async () => {
    const first = deferred(), second = deferred();
    bridge.select.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await render({ currentSong: song('B') }); await render({ currentSong: song('C') });
    await act(async () => first.resolve({ mode: 'hanabi' }));
    expect(setMode).not.toHaveBeenCalled();
    await act(async () => second.resolve({ mode: 'lumiere' }));
    expect(setMode).toHaveBeenCalledExactlyOnceWith('lumiere', { notify: false });
});

it('leaves the current style in place when enabled and resumes on the next song', async () => {
    await render({ enabled: false }); await render({ currentSong: song('B') });
    await render({ enabled: true }); expect(bridge.select).not.toHaveBeenCalled();
    bridge.select.mockResolvedValueOnce({ mode: 'hanabi' });
    await render({ currentSong: song('C') });
    expect(setMode).toHaveBeenCalledExactlyOnceWith('hanabi', { notify: false });
});

it('does not replace a manual style change or apply a result after disabling', async () => {
    const first = deferred(), second = deferred();
    bridge.select.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await render({ currentSong: song('B') }); await render({ visualizerMode: 'lumiere' });
    await act(async () => first.resolve({ mode: 'hanabi' })); expect(setMode).not.toHaveBeenCalled();
    await render({ currentSong: song('C') }); await render({ enabled: false });
    await act(async () => second.resolve({ mode: 'hanabi' })); expect(setMode).not.toHaveBeenCalled();
});

it('uses the selected pool for a rejected native request even after metadata hydration', async () => {
    const result = deferred(); bridge.select.mockReturnValueOnce(result.promise);
    await render({ currentSong: song('B') }); await render({ currentSong: { ...song('B'), name: 'Hydrated' } });
    await act(async () => result.reject(new Error('Style selection unavailable')));
    expect(setMode).toHaveBeenCalledTimes(1);
    expect(['hanabi', 'lumiere']).toContain(setMode.mock.calls[0][0]);
});

it('distinguishes equal media ids from different providers', async () => {
    bridge.select.mockResolvedValueOnce({ mode: 'hanabi' });
    await render({ currentSong: song('A', 'qq') });
    expect(bridge.select.mock.calls[0][0].songKey).toBe('online:qq:A');
    expect(setMode).toHaveBeenCalledExactlyOnceWith('hanabi', { notify: false });
});

it('keeps browser selection synchronous and does not reroll on metadata changes', async () => {
    bridge.android = false;
    await render({ currentSong: song('B') }); await render({ currentSong: { ...song('B'), name: 'Hydrated' } });
    expect(bridge.select).not.toHaveBeenCalled(); expect(setMode).toHaveBeenCalledTimes(1);
    expect(['hanabi', 'lumiere']).toContain(setMode.mock.calls[0][0]);
});

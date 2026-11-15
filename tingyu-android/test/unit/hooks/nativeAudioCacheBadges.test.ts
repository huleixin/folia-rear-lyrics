// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useNativeAudioCacheBadges } from '@/hooks/useNativeAudioCacheBadges';
import type { NativePageModel } from '@/types/nativePages';

// test/unit/hooks/nativeAudioCacheBadges.test.ts
// Cached marks must disappear after clearing, and stale route responses must never mark new rows.
const native = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/platform/runtime', () => ({ isCapacitorAndroid: () => true }));
vi.mock('@/platform/tingyuPlayback', () => ({ getTingyuPlayback: () => ({ audioOffline: native.request }) }));
vi.mock('@/stores/useAudioSettingsStore', () => ({ useAudioSettingsStore: (select: any) => select({ audioQuality: 'lossless' }) }));
vi.mock('@/stores/useLxSourceStore', () => ({ useLxSourceStore: (select: any) => select({ revision: 1 }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const model = (keys: string[]): NativePageModel => ({ key: 'fixture', title: 'Songs', sections: [{ id: 'tracks', layout: 'rows', items: keys.map(key => ({ id: key, title: key, audioCacheKey: key })) }] });
let root: Root, host: HTMLDivElement;
function Probe({ page }: { page: NativePageModel }) {
    const result = useNativeAudioCacheBadges(page, true);
    return createElement('span', { 'data-marks': result?.sections[0].items?.map(i => i.audioCached ? '1' : '0').join('') });
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); native.request.mockReset(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('refreshes verified marks after the file is cleared', async () => {
    native.request.mockResolvedValueOnce({ keys: ['one'] }).mockResolvedValue({ keys: [] });
    await act(async () => root.render(createElement(Probe, { page: model(['one']) })));
    expect(host.firstElementChild?.getAttribute('data-marks')).toBe('1');
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(host.firstElementChild?.getAttribute('data-marks')).toBe('0');
});
it('ignores late responses from a previous quality or route', async () => {
    let resolve!: (value: { keys: string[] }) => void;
    native.request.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue({ keys: ['new-route'] });
    await act(async () => root.render(createElement(Probe, { page: model(['old-route']) })));
    await act(async () => root.render(createElement(Probe, { page: model(['new-route']) })));
    await act(async () => resolve({ keys: ['old-route'] }));
    expect(host.firstElementChild?.getAttribute('data-marks')).toBe('1');
});
it('uses one bounded batch instead of one native request per song', async () => {
    native.request.mockResolvedValue({ keys: ['one'] });
    await act(async () => root.render(createElement(Probe, { page: model(Array.from({ length: 150 }, (_, i) => `track-${i}`)) })));
    expect(native.request).toHaveBeenCalledTimes(1); expect(native.request.mock.calls[0][0].keys).toHaveLength(100);
});

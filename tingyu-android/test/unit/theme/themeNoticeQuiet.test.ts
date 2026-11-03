// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useThemeController, type GenerateAIThemeResult } from '@/hooks/useThemeController';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useStatusMessageStore } from '@/stores/useStatusMessageStore';
import { FALLBACK_AI_DUAL_THEME } from '@/services/themeSanitizer';
import { getPlaybackSongKey } from '@/utils/appPlaybackGuards';
import type { DualTheme, LyricData, SongResult } from '@/types';

// test/unit/theme/themeNoticeQuiet.test.ts
// Automatic AI themes must not draw over the lyrics; manual ones must still answer, and a real
// failure must not disappear.
//
// The contract under test is the status channel, not the string: with `t: key => key` the toast text
// *is* the translation key, so `message === null` means "nothing was drawn" and
// `message.text === 'status.generatingTheme'` means "the listener was told it is generating".
//
// The generation itself must keep working in every case — a quiet run still writes the cache, still
// records the trigger in the diagnostics ring and still applies the theme. That is the half of this
// that a "delete the toast call" fix would have silently broken.

const io = vi.hoisted(() => ({
    generate: vi.fn(), save: vi.fn(), cached: vi.fn(), lastDual: vi.fn(),
    lastLegacy: vi.fn(), sync: vi.fn(), colors: vi.fn(),
}));
vi.mock('@/services/gemini', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/services/gemini')>(),
    generateThemeFromLyrics: io.generate,
}));
vi.mock('@/services/db', () => ({ saveToCache: io.save }));
vi.mock('@/services/themeCache', () => ({
    getCachedThemeState: io.cached,
    getCachedThemeStateForSong: io.cached,
    getLastDualTheme: io.lastDual,
    getLastLegacyTheme: io.lastLegacy,
}));
vi.mock('@/services/sync/syncRepository', () => ({ saveSyncedThemeForSong: io.sync }));
vi.mock('@/utils/colorExtractor', () => ({ extractColors: io.colors }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SONG: SongResult = {
    id: 1, name: 'Song 1', artists: [], album: { id: 1, name: 'Album' }, durationMs: 60_000,
};
const THEME: DualTheme = {
    light: { ...FALLBACK_AI_DUAL_THEME.light, name: 'Light from AI' },
    dark: { ...FALLBACK_AI_DUAL_THEME.dark, name: 'Dark from AI' },
};
const lyrics: LyricData = {
    lines: [{ fullText: 'A lyric to color', startTime: 0, endTime: 1, words: [] }],
};
const cacheKey = (value: SongResult) => `dual_theme_${getPlaybackSongKey(value)}`;

let root: Root;
let container: HTMLDivElement;
let controller: ReturnType<typeof useThemeController>;
let cache: Map<string, DualTheme>;

const Probe = () => {
    controller = useThemeController({
        defaultTheme: FALLBACK_AI_DUAL_THEME.dark, daylightTheme: FALLBACK_AI_DUAL_THEME.light,
        isDaylight: false, setDaylightPreference() {}, coverUrl: 'cover.png', t: key => key,
    });
    return null;
};

const message = () => useStatusMessageStore.getState().message;
const start = (options: Parameters<typeof controller.generateAITheme>[2] = {}) => {
    let request!: Promise<GenerateAIThemeResult>;
    act(() => { request = controller.generateAITheme(lyrics, SONG, options); });
    return request;
};

beforeEach(() => {
    Object.values(io).forEach(mock => mock.mockReset());
    localStorage.clear();
    cache = new Map();
    io.save.mockImplementation(async (key: string, value: DualTheme) => { cache.set(key, value); });
    io.cached.mockResolvedValue({ kind: 'none' });
    io.lastDual.mockResolvedValue(null);
    io.lastLegacy.mockResolvedValue(null);
    io.sync.mockResolvedValue(undefined);
    io.colors.mockResolvedValue(['#2288cc']);
    io.generate.mockResolvedValue(THEME);
    usePlaybackStore.setState({ currentSong: SONG });
    useStatusMessageStore.setState({ message: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    container = document.body.appendChild(document.createElement('div'));
    root = createRoot(container);
});

/** Mounted per test, because the generation source is read once, when the hook first runs. */
const mount = (source: 'ai' | 'cover' = 'ai') => {
    localStorage.setItem('theme_generation_source', source);
    act(() => root.render(createElement(Probe)));
};

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    usePlaybackStore.setState({ currentSong: null });
    vi.restoreAllMocks();
});

describe('automatic theme work stays off the screen', () => {
    it('applies an auto-generated theme without drawing anything', async () => {
        mount();
        let result!: GenerateAIThemeResult;
        await act(async () => { result = await start({ source: 'auto' }); });

        expect(result).toEqual({ status: 'generated', applied: true });
        // Nothing on screen — not "正在生成", not "已应用主题".
        expect(message()).toBeNull();
        // …but the work happened: cached, applied, attributed to the automatic trigger.
        expect(cache.get(cacheKey(SONG))?.dark.name).toBe('Dark from AI');
        expect(io.sync).toHaveBeenCalledWith(SONG, expect.anything(), 'auto');
        expect(controller.bgMode).toBe('ai');
        expect(controller.theme.name).toBe('Dark from AI');
        expect(controller.isGeneratingTheme).toBe(false);
        // And it is still traceable afterwards.
        expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Dark from AI'));
    });

    it('keeps the in-flight notice quiet for automatic runs and shows it for manual ones', async () => {
        mount();
        let release!: (value: DualTheme) => void;
        io.generate.mockReturnValueOnce(new Promise<DualTheme>(resolve => { release = resolve; }));

        let request!: Promise<GenerateAIThemeResult>;
        act(() => { request = controller.generateAITheme(lyrics, SONG, { source: 'auto' }); });
        expect(controller.isGeneratingTheme).toBe(true);
        expect(message()).toBeNull();
        await act(async () => { release(THEME); await request; });

        io.generate.mockResolvedValueOnce(THEME);
        let manual!: Promise<GenerateAIThemeResult>;
        act(() => { manual = controller.generateAITheme(lyrics, SONG); });
        expect(message()?.text).toBe('status.generatingTheme');
        await act(async () => { await manual; });
        expect(message()?.text).toBe('status.themeApplied');
        expect(message()?.type).toBe('success');
    });

    it('says nothing when an automatic run falls back to the cover theme', async () => {
        mount('cover');

        let result!: GenerateAIThemeResult;
        await act(async () => { result = await start({ source: 'auto' }); });

        expect(result).toEqual({ status: 'generated', applied: true });
        expect(message()).toBeNull();
        expect(io.generate).not.toHaveBeenCalled();
        expect(cache.get(cacheKey(SONG))).toBeTruthy();
    });

    it('logs an automatic failure instead of showing it, and leaves the theme alone', async () => {
        mount();
        io.generate.mockRejectedValueOnce(new Error('network down'));

        let result!: GenerateAIThemeResult;
        await act(async () => { result = await start({ source: 'auto' }); });

        expect(result).toEqual({ status: 'failed' });
        expect(message()).toBeNull();
        expect(console.info).toHaveBeenCalledWith(expect.stringContaining('generation failed'));
        expect(controller.bgMode).not.toBe('ai');
    });
});

describe('manual work still answers', () => {
    it('reports a manual failure, because the listener is waiting for a result', async () => {
        mount();
        io.generate.mockRejectedValueOnce(new Error('network down'));

        let result!: GenerateAIThemeResult;
        await act(async () => { result = await start(); });

        expect(result).toEqual({ status: 'failed' });
        expect(message()).toEqual(expect.objectContaining({ type: 'error', text: 'status.themeGenerationFailed' }));
    });

    it('confirms a saved custom theme unchanged', async () => {
        mount();
        act(() => { controller.saveCustomDualTheme(THEME); });
        expect(message()).toEqual(expect.objectContaining({ type: 'success', text: 'notifications.savedCustomTheme' }));
    });
});

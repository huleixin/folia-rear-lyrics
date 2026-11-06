// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '../../../src/types';

// test/unit/lyrics/localNativeLyricBridge.test.ts
// 专项修复：本地歌歌词只留在 WebView 内存，灵动岛 / 背屏 / 原生歌词页共用的
// 统一仓库拿不到（ensureNativeLyric 直接 return false）。这里验证本地歌现在走
// 同一条发布通道，且用稳定 songKey、不联网、真没词时明确宣告。

const publish = vi.fn(async (
    _info: string, _hasTranslation: boolean, _songKey: string | null, _options?: unknown,
) => true);
const clear = vi.fn(async (_songKey?: string | null) => undefined);
const getOmniLyrics = vi.fn(async (..._args: unknown[]) => ({ lyrics: null, isPureMusic: false }));
const resolveLocalLyrics = vi.fn(async (..._args: unknown[]) => ({
    lyrics: null as unknown, source: null as string | null,
}));
const getLocalSong = vi.fn(async (_id: string) => ({ id: 'x' }));

vi.mock('../../../src/platform/foliaColorOsLyrics', () => ({
    publishColorOsLyricInfo: (
        info: string, hasTranslation: boolean, songKey: string | null, options?: unknown,
    ) => publish(info, hasTranslation, songKey, options),
    clearColorOsLyricInfo: (songKey?: string | null) => clear(songKey),
    getColorOsLyricsSupport: async () => ({ supported: true, colorOsMajor: 14, detail: 'test' }),
}));
vi.mock('../../../src/services/sharedSongResources', () => ({
    readSharedLyricRecord: async () => null,
}));
vi.mock('../../../src/services/prefetchService', () => ({ getPrefetchedData: () => null }));
vi.mock('../../../src/services/onlineMusic/resourceCache', () => ({
    getSongCacheWithLegacyMigration: async () => null,
}));
vi.mock('../../../src/services/onlineMusic/resourceKeys', () => ({
    getSongResourceCacheKey: () => 'lyric:test',
}));
vi.mock('../../../src/services/db', () => ({
    getLocalSong: (id: string) => getLocalSong(id),
    saveToCache: async () => undefined,
}));
vi.mock('../../../src/services/onlineMusic/omni', () => ({
    omni: { getLyrics: (...args: unknown[]) => getOmniLyrics(...args) },
}));
vi.mock('../../../src/utils/lyrics/renderHints', () => ({
    migrateLyricDataRenderHints: (data: unknown) => data,
}));
vi.mock('../../../src/services/lyricSessionGeneration', () => ({
    nextColorOsGeneration: () => 1,
}));
vi.mock('../../../src/utils/lyricsDiagnostics', () => ({ noteLyricsDiagnostic: vi.fn() }));
vi.mock('../../../src/utils/lyrics/localSongLyrics', () => ({
    resolveLocalSongLyrics: (...args: unknown[]) => resolveLocalLyrics(...args),
}));
vi.mock('../../../src/stores/useLyricSettingsStore', () => ({
    useLyricSettingsStore: { getState: () => ({ localLyricsPriority: 'local' }) },
}));

import { ensureNativeLyric, primeNativeLyricsForSongs } from '../../../src/services/nativeLyricPriming';

const localSong = (id: string): SongResult => ({
    id, name: '茶花开了', durationMs: 269_000,
    artists: [{ id: 0, name: '王睿卓' }], album: { id: 0, name: '专辑A' },
    isLocal: true,
    localRef: { songId: id },
    sourceRef: { kind: 'local', mediaId: id },
} as unknown as SongResult);

const timedLyrics = {
    lines: [
        { startTime: 0, fullText: '那是一座座山连着山的小村庄' },
        { startTime: 12.5, fullText: '那是一湾湾水绕着水的小河塘' },
    ],
    isWordByWord: false,
};

describe('本地歌词接入统一原生仓库', () => {
    beforeEach(() => {
        publish.mockClear(); clear.mockClear(); getOmniLyrics.mockClear();
        resolveLocalLyrics.mockReset(); getLocalSong.mockClear();
    });

    it('本地歌不再被跳过：同一份歌词按稳定 songKey 发布，且完全不联网', async () => {
        resolveLocalLyrics.mockResolvedValue({ lyrics: timedLyrics, source: 'local' });
        const ok = await ensureNativeLyric(localSong('s-timed'), undefined, { fetch: false });
        expect(resolveLocalLyrics).toHaveBeenCalledTimes(1);
        expect(getLocalSong).toHaveBeenCalledWith('s-timed');
        expect(ok).toBe(true);
        expect(publish).toHaveBeenCalledTimes(1);
        const [info, , key] = publish.mock.calls[0];
        expect(key).toBe('local:s-timed');
        expect(info).toContain('小村庄');
        expect(info).toContain('[00:12.500]');
        // 本地歌词全在曲库记录里，绝不该去在线音源搜词。
        expect(getOmniLyrics).not.toHaveBeenCalled();
    });

    it('真正没有歌词时明确宣告无词，避免灵动岛/背屏残留上一首', async () => {
        resolveLocalLyrics.mockResolvedValue({ lyrics: null, source: null });
        const ok = await ensureNativeLyric(localSong('s-empty'), undefined, { fetch: false });
        expect(ok).toBe(false);
        expect(publish).not.toHaveBeenCalled();
        expect(clear).toHaveBeenCalledWith('local:s-empty');
        expect(getOmniLyrics).not.toHaveBeenCalled();
    });

    it('队列预置也覆盖本地歌（后台自动切歌前有词可用）', async () => {
        resolveLocalLyrics.mockResolvedValue({ lyrics: timedLyrics, source: 'local' });
        await primeNativeLyricsForSongs([localSong('s-queue')], 'standard');
        expect(publish).toHaveBeenCalled();
        expect(publish.mock.calls[0]?.[2]).toBe('local:s-queue');
    });

    it('手动关联的歌词优先：解析服务收到的是曲库记录与当前来源优先级', async () => {
        resolveLocalLyrics.mockResolvedValue({ lyrics: timedLyrics, source: 'local' });
        await ensureNativeLyric(localSong('s-priority'), undefined, { fetch: false });
        const [record, priority] = resolveLocalLyrics.mock.calls[0] as unknown as [unknown, string];
        expect(record).toEqual({ id: 'x' });
        expect(priority).toBe('local');
    });
});

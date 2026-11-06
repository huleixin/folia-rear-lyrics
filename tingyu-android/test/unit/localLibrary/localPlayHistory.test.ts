import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalSong } from '../../../src/types';

// test/unit/localLibrary/localPlayHistory.test.ts
// 本地推荐首页的数据规则：播放计数与 45 秒去重、常听专辑聚合、「本地30首」当天稳定跨天更新、
// 久未播放与随机探索的取数。首页 UI 严格按这些函数取数，数字必须真实。

const makeSong = (id: string, albumName: string, artist = '歌手A', addedAt = 1000): LocalSong => ({
    id,
    fileName: `${id}.mp3`,
    filePath: `Music/${id}.mp3`,
    duration: 200_000,
    fileSize: 1,
    mimeType: 'audio/mpeg',
    addedAt,
    title: `歌曲${id}`,
    titleOrigin: 'import',
    importedMetadata: { title: `歌曲${id}`, titleSource: 'filename', artistNames: [artist], albumName },
    hasManualLyricSelection: false,
    noAutoMatch: false,
});

// node 环境没有 window；Dexie 与服务都按 window 探测环境（indexedDB、dispatchEvent），
// 这里直接把 window 指回 globalThis —— fake-indexeddb/auto 已把 indexedDB 挂在 globalThis 上，
// Node 15+ 的 globalThis 本身就是 EventTarget，事件断言也因此可用。
(globalThis as unknown as { window: unknown }).window = globalThis;
const firedEvents: string[] = [];
// Node 的 globalThis 不是 EventTarget（没有 addEventListener/dispatchEvent），
// 补一个捕获版 dispatchEvent：服务里的 window.dispatchEvent 会命中这里。
(globalThis as unknown as { dispatchEvent?: (event: { type: string; }) => boolean }).dispatchEvent = (event) => {
    firedEvents.push(event.type);
    return true;
};

type LocalPlayHistoryModule = typeof import('../../../src/services/localPlayHistory');
let history: LocalPlayHistoryModule;

beforeAll(async () => {
    // 整个文件共用一个模块实例：Dexie 只开一次，节流表状态由用例自己用假时钟控制。
    history = await import('../../../src/services/localPlayHistory');
});

beforeEach(async () => {
    const { appDatabase } = await import('../../../src/services/appDatabase');
    await appDatabase.local_play_history.clear();

});

describe('recordLocalSongPlay', () => {
    it('同一首歌 45 秒内只记一次；超过窗口再播才累加', async () => {
        // 播放状态切换（seek 重试、外观重放）会在短时间内重复触发 PLAYING，
        // 服务按 45 秒窗口去重。用 Date.now 的 spy 推进时间 —— 不能用 vi.useFakeTimers，
        // 假时钟会把 Dexie 内部的定时调度也冻住，数据库永远打不开。
        const realNow = Date.now();
        let mockedNow = realNow;
        const clock = vi.spyOn(Date, 'now').mockImplementation(() => mockedNow);
        try {
            await history.recordLocalSongPlay('throttle-1');
            await history.recordLocalSongPlay('throttle-1');
            await history.recordLocalSongPlay('throttle-2');
            let records = await history.getLocalPlayHistory();
            expect(records.find(record => record.songId === 'throttle-1')?.playCount).toBe(1);
            expect(records.find(record => record.songId === 'throttle-2')?.playCount).toBe(1);
            mockedNow = realNow + 46_000;
            await history.recordLocalSongPlay('throttle-1');
            records = await history.getLocalPlayHistory();
            expect(records.find(record => record.songId === 'throttle-1')?.playCount).toBe(2);
        } finally {
            clock.mockRestore();
        }
    });

    it('记录后通知界面刷新（local-play-history-updated 事件）', async () => {
        await history.recordLocalSongPlay('event-1');
        expect(firedEvents).toContain('folia-local-play-history-updated');
    });
});

describe('resolveLocalPlayHistory', () => {
    it('已删除的歌不出现在结果里（宁少一首也不给播不了的）', async () => {
        // 用独立 id：45 秒去重表是模块级状态，跨用例共享，同名 id 会被上一用例的未来时间戳挡掉。
        await history.recordLocalSongPlay('live-1');
        await history.recordLocalSongPlay('deleted-1');
        const plays = await history.resolveLocalPlayHistory([makeSong('live-1', '专辑A')]);
        expect(plays.map(play => play.song.id)).toEqual(['live-1']);
        expect(plays[0].playCount).toBe(1);
    });
});

describe('aggregateLocalAlbumPlays', () => {
    it('按专辑聚合计数；无专辑名的歌不编造专辑', () => {
        const plays = [
            { song: makeSong('s1', '专辑A'), playCount: 3, lastPlayedAt: 10 },
            { song: makeSong('s2', '专辑A', '歌手B'), playCount: 2, lastPlayedAt: 20 },
            { song: makeSong('s3', ''), playCount: 9, lastPlayedAt: 30 },
        ];
        const stats = history.aggregateLocalAlbumPlays(plays);
        expect(stats).toHaveLength(1);
        expect(stats[0].albumName).toBe('专辑A');
        expect(stats[0].playCount).toBe(5);
        expect(stats[0].lastPlayedAt).toBe(20);
        expect(stats[0].songs.map(song => song.id).sort()).toEqual(['s1', 's2']);
    });
});

describe('pickDailyLocalSongs', () => {
    const songs = Array.from({ length: 80 }, (_, index) => makeSong(`s${index}`, '专辑'));

    it('同一天内多次调用结果完全一致（当天推荐稳定）', () => {
        const seed = history.localDailySeed(1_700_000_000_000);
        const first = history.pickDailyLocalSongs(songs, seed).map(song => song.id);
        const second = history.pickDailyLocalSongs(songs, seed).map(song => song.id);
        expect(first).toEqual(second);
        expect(first).toHaveLength(30);
    });

    it('跨天换种子会换一批（每日更新的含义）', () => {
        const day1 = history.pickDailyLocalSongs(songs, '2026-11-6').map(song => song.id);
        const day2 = history.pickDailyLocalSongs(songs, '2026-11-7').map(song => song.id);
        expect(day1).not.toEqual(day2);
    });

    it('曲库不足 30 首时如实收缩，不凑数', () => {
        expect(history.pickDailyLocalSongs([makeSong('s1', '专辑'), makeSong('s2', '专辑')], 'seed')).toHaveLength(2);
        expect(history.pickDailyLocalSongs([], 'seed')).toHaveLength(0);
    });
});

describe('pickLeastRecentlyPlayed / pickRandomLocalSongs', () => {
    it('久未播放按 lastPlayedAt 升序取（最久没听的排最前）', () => {
        const plays = [
            { song: makeSong('a', 'x'), playCount: 1, lastPlayedAt: 300 },
            { song: makeSong('b', 'x'), playCount: 1, lastPlayedAt: 100 },
            { song: makeSong('c', 'x'), playCount: 1, lastPlayedAt: 200 },
        ];
        expect(history.pickLeastRecentlyPlayed(plays, 2).map(play => play.song.id)).toEqual(['b', 'c']);
    });

    it('随机探索只从真实曲库里取，且数量不超过库存', () => {
        const songs = [makeSong('s1', 'x'), makeSong('s2', 'x'), makeSong('s3', 'x')];
        const picked = history.pickRandomLocalSongs(songs, 20);
        expect(picked.length).toBeLessThanOrEqual(3);
        picked.forEach(song => expect(songs.some(origin => origin.id === song.id)).toBe(true));
        expect(history.pickRandomLocalSongs([], 20)).toHaveLength(0);
    });
});

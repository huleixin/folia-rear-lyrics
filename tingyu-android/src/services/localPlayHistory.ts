import { appDatabase, type LocalPlayHistoryRecord } from './appDatabase';
import type { LocalSong } from '../types';

// src/services/localPlayHistory.ts
/**
 * 本地歌的播放记录。
 *
 * 本地推荐首页的「常听精选 / 最近播放 / 常听专辑 / 久未播放」都从这里取数。
 * 与在线歌的最近播放（useMobileLibraryStore.recentTracks，localStorage）是两套：
 * 在线那份明确不收本地歌（见 remember 的注释），这里只收本地，两边互不混写。
 *
 * 记录只存 songId + 次数 + 时间戳：名称、封面、专辑归属在展示时从当前曲库 join。
 * 这样文件改名、封面补全、实体合并之后历史仍然对得上，删掉的歌自然消失
 * （找不到 id 的记录保留在表里但不展示，歌曲重新入库后播放次数还能接上）。
 */

export const LOCAL_PLAY_HISTORY_UPDATED_EVENT = 'folia-local-play-history-updated';

/** 同一首歌 45 秒内重复触发只记一次：切歌失败重试、seek 触发的外观重放都不该刷次数。 */
const DEDUPE_WINDOW_MS = 45_000;

/** 最近播放/常听精选默认取多少条；首页横滑 rail 用，全部列表另取。 */
export const LOCAL_HISTORY_RAIL_LIMIT = 12;

let lastRecordedAt = new Map<string, number>();

const notifyUpdated = () => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(LOCAL_PLAY_HISTORY_UPDATED_EVENT));
    }
};

/**
 * 记一次本地歌播放。
 *
 * 由 useMobileListeningHistory 在播放状态真正变为 PLAYING 时调用；
 * 这里只负责去重与落库，不关心播放器内部状态。
 */
export const recordLocalSongPlay = async (songId: string): Promise<void> => {
    if (!songId) return;
    const now = Date.now();
    const previous = lastRecordedAt.get(songId);
    if (previous && now - previous < DEDUPE_WINDOW_MS) return;
    lastRecordedAt.set(songId, now);
    try {
        const existing = await appDatabase.local_play_history.get(songId);
        const record: LocalPlayHistoryRecord = existing
            ? { ...existing, playCount: existing.playCount + 1, lastPlayedAt: now }
            : { songId, playCount: 1, lastPlayedAt: now, firstPlayedAt: now };
        await appDatabase.local_play_history.put(record);
        notifyUpdated();
    } catch (error) {
        console.warn('[LocalPlayHistory] Failed to record a local play:', error);
    }
};

export const getLocalPlayHistory = async (): Promise<LocalPlayHistoryRecord[]> => {
    try {
        const records = await appDatabase.local_play_history.toArray();
        return records.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
    } catch (error) {
        console.warn('[LocalPlayHistory] Failed to read local play history:', error);
        return [];
    }
};

/** 本地播放记录条数（空状态判断用）。 */
export const countLocalPlayHistory = async (): Promise<number> => {
    try {
        return await appDatabase.local_play_history.count();
    } catch {
        return 0;
    }
};

export type ResolvedLocalPlay = {
    song: LocalSong;
    playCount: number;
    lastPlayedAt: number;
};

/**
 * 把播放记录 join 回当前曲库。
 *
 * 已删除/已移走的歌直接跳过——「最近播放」出现一首播不了的歌比少一首更糟。
 */
export const resolveLocalPlayHistory = async (
    localSongs: readonly LocalSong[],
): Promise<ResolvedLocalPlay[]> => {
    const [records, songsById] = await Promise.all([
        getLocalPlayHistory(),
        Promise.resolve(new Map(localSongs.map(song => [song.id, song]))),
    ]);
    const resolved: ResolvedLocalPlay[] = [];
    for (const record of records) {
        const song = songsById.get(record.songId);
        if (song) resolved.push({ song, playCount: record.playCount, lastPlayedAt: record.lastPlayedAt });
    }
    return resolved;
};

/**
 * 常听专辑：按专辑名聚合播放次数。
 *
 * 专辑归属跟随曲库（importedMetadata.albumName / 在线匹配的专辑名），聚合在读取时做，
 * 记录本身不存专辑字符串——用户改标签或实体合并后这里自动跟着对。
 */
export type LocalAlbumPlayStat = {
    albumKey: string;
    albumName: string;
    artistName: string;
    playCount: number;
    lastPlayedAt: number;
    songs: LocalSong[];
};

export const getLocalSongAlbumKey = (song: LocalSong): string => (
    song.onlineMetadata?.album?.name || song.importedMetadata?.albumName || ''
);

export const getLocalSongArtistNames = (song: LocalSong): string[] => (
    song.onlineMetadata?.artists.map(artist => artist.name).filter(Boolean)
    || song.importedMetadata?.artistNames
    || []
);

export const aggregateLocalAlbumPlays = (
    plays: readonly ResolvedLocalPlay[],
): LocalAlbumPlayStat[] => {
    const byAlbum = new Map<string, LocalAlbumPlayStat>();
    for (const play of plays) {
        const albumName = getLocalSongAlbumKey(play.song);
        if (!albumName) continue;
        const key = albumName.toLocaleLowerCase();
        const existing = byAlbum.get(key);
        if (existing) {
            existing.playCount += play.playCount;
            existing.lastPlayedAt = Math.max(existing.lastPlayedAt, play.lastPlayedAt);
            if (!existing.songs.some(song => song.id === play.song.id)) existing.songs.push(play.song);
        } else {
            byAlbum.set(key, {
                albumKey: key,
                albumName,
                artistName: getLocalSongArtistNames(play.song)[0] || '',
                playCount: play.playCount,
                lastPlayedAt: play.lastPlayedAt,
                songs: [play.song],
            });
        }
    }
    return Array.from(byAlbum.values())
        .sort((a, b) => b.playCount - a.playCount || b.lastPlayedAt - a.lastPlayedAt);
};

/**
 * 本地 30 首：当天稳定、跨天更新。
 *
 * 用「日期 + songId」做确定性排序而不是纯随机：同一天内每次进首页看到同一批，
 * 第二天自然换一批（这正是设计里「每日更新」的含义），也不需要持久化任何状态。
 */
export const localDailySeed = (now = Date.now()): string => {
    const date = new Date(now);
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

const hashString = (value: string): number => {
    // FNV-1a：足够散、确定性、无依赖。
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

export const pickDailyLocalSongs = (
    songs: readonly LocalSong[],
    seed: string,
    limit = 30,
): LocalSong[] => {
    if (songs.length === 0) return [];
    const ordered = songs
        .map(song => ({ song, rank: hashString(`${seed}:${song.id}`) }))
        .sort((a, b) => a.rank - b.rank)
        .map(entry => entry.song);
    return ordered.slice(0, Math.min(limit, ordered.length));
};

/**
 * 久未播放：有播放记录、但最近一次播放离现在最久的那批。
 *
 * 没播过的歌不算「久未播放」——那是「随机探索」的地盘。
 */
export const pickLeastRecentlyPlayed = (
    plays: readonly ResolvedLocalPlay[],
    limit = 12,
): ResolvedLocalPlay[] => (
    [...plays]
        .sort((a, b) => a.lastPlayedAt - b.lastPlayedAt)
        .slice(0, limit)
);

/** 随机探索：整库随机取一批（Fisher-Yates 局部洗牌就够）。 */
export const pickRandomLocalSongs = (songs: readonly LocalSong[], limit = 20): LocalSong[] => {
    const pool = [...songs];
    const count = Math.min(limit, pool.length);
    for (let index = 0; index < count; index += 1) {
        const swap = index + Math.floor(Math.random() * (pool.length - index));
        const temp = pool[index];
        pool[index] = pool[swap];
        pool[swap] = temp;
    }
    return pool.slice(0, count);
};

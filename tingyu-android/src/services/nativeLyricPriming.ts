import { getPlaybackSongKey, isLocalPlaybackSong, isNavidromePlaybackSong } from '../utils/appPlaybackGuards';
import { getPrefetchedData } from './prefetchService';
import { getSongCacheWithLegacyMigration } from './onlineMusic/resourceCache';
import { getSongResourceCacheKey } from './onlineMusic/resourceKeys';
import { saveToCache } from './db';
import { omni } from './onlineMusic/omni';
import { migrateLyricDataRenderHints } from '../utils/lyrics/renderHints';
import { buildColorOsLyricInfo } from '../utils/lyrics/colorOsLyricInfo';
import { publishColorOsLyricInfo, clearColorOsLyricInfo } from '../platform/foliaColorOsLyrics';
import { nextColorOsGeneration } from './lyricSessionGeneration';
import { createProviderSongMetadata } from '../utils/songMetadata';
import { noteLyricsDiagnostic } from '../utils/lyricsDiagnostics';
import type { AudioQualityPreference } from '../types/onlineMusic';
import type { LyricData, SongResult } from '../types';

// src/services/nativeLyricPriming.ts
// Hand the native player the lyrics of tracks it is about to reach, before it reaches them.
//
// Without this, the lyric timeline for track N+1 can only be published after JS wakes up, finds
// out the track changed, loads lyrics and crosses the bridge. In a locked background session that
// chain may not run for minutes, and the island shows nothing for the whole time - not because
// the lyrics are missing but because nobody handed them over.
//
// C2 之前这条链有两个断点，合起来就是「第二首没词」：
//
//   1. 预置只在换歌那一个瞬间跑一次，而那一刻第二首的歌词**还在网络上**（预取刚开始）。
//      预置跳过了它，预取晚一点才到，此后没有任何东西再预置一次 —— 原生缓存里始终没有它。
//      现在「要预置的曲目」被记下来（`wanted`），预取一有结果就补一次发布
//      （`notifyPrefetchedLyrics`），不再依赖某个渲染时机。
//
//   2. 原生在后台问「这一首的词呢」时，旧实现只读 IndexedDB，而预取到的歌词**从不写盘**
//      （写盘只发生在它成为当前曲、被播放器页加载时）。所以即使预取成功也补不上。
//      现在统一走 `ensureNativeLyric`：预取内存 → IndexedDB → （仅在明确允许时）联网取一次，
//      取到后落盘，下一次冷启动不必再联网。

/**
 * 本地「已经交过去」的记录长度。
 *
 * 必须**小于**原生缓存容量（`ColorOsLyricBridge.MAX_CACHED_SONGS = 16`）：这个列表只用来
 * 避免重复构建，它假定「记过的这首原生还留着」。列表和缓存一样深（原来是 16 vs 6）时，
 * 被原生淘汰掉的歌还留在列表里，就再也不会被补交 —— 锁屏连播到第 7 首开始空词正是这个。
 * 10 留出了足够的余量：列表里任何一首都是最近 10 次交出去的，原生一定还留着。
 */
const PRIMED_LIMIT = 10;
/** 一次最多向原生预置多少首（含当前曲之后的顺序），与原生缓存容量对齐。 */
export const LYRIC_PRIME_AHEAD = 12;
/** 同时在飞的取词请求上限：后台补词是增强，不能把播放器的网络与 CPU 抢光。 */
const MAX_CONCURRENT_FETCHES = 2;

const primed: string[] = [];
/** 「这一首应该被预置」——由队列窗口声明；歌词晚到时用它决定要不要补。 */
const wanted: string[] = [];
/**
 * 已经问过、且服务端明确回答「没有词」的曲目。
 *
 * 没有这一条，原生每 3 秒/12 秒的重问都会再联网一次；而答案不会变。真正的「确认没词」
 * 由 `clearColorOsLyricInfo(key)` 宣告给原生（metadata 写 noLyric），原生随即停止重问。
 */
const knownEmpty: string[] = [];
const inFlight = new Map<string, Promise<boolean>>();
let activeFetches = 0;

const markPrimed = (key: string): void => {
    if (primed.includes(key)) return;
    primed.push(key);
    while (primed.length > PRIMED_LIMIT) primed.shift();
};

const isPrimed = (key: string): boolean => primed.includes(key);

const markWanted = (key: string): void => {
    if (wanted.includes(key)) return;
    wanted.push(key);
    while (wanted.length > LYRIC_PRIME_AHEAD * 2) wanted.shift();
};

/** Playback ended / another session took over: allow rebuilding later. */
export const resetNativeLyricPriming = (): void => {
    primed.length = 0;
    wanted.length = 0;
    knownEmpty.length = 0;
    inFlight.clear();
    activeFetches = 0;
};

/** 只读本地：预取内存（最快、也是预取唯一落点）→ IndexedDB（真正被播放过的那一首）。 */
const readCachedLyrics = async (
    song: SongResult,
    quality?: AudioQualityPreference,
): Promise<{ lyrics: LyricData; source: 'prefetch' | 'db' } | null> => {
    try {
        const prefetched = getPrefetchedData(song, quality);
        if (prefetched?.lyrics?.lines?.length) return { lyrics: prefetched.lyrics, source: 'prefetch' };
        const cached = await getSongCacheWithLegacyMigration<LyricData>('lyric', song, migrateLyricDataRenderHints);
        return cached?.lines?.length ? { lyrics: cached, source: 'db' } : null;
    } catch {
        return null;
    }
};

/**
 * 原生补词的第四层证据：JS 这一侧到底做了什么。
 *
 * 报告里必须能分开：未获取（not-cached / fetch-failed）、已获取未构建（confirmed-empty）、
 * 已构建未发布（published=false）、已发布（published=true）。没有这一行，真机上「第二首
 * 没词」只能靠猜；有了它，`lyric-request` 与 `native:lyric-answer` 一对就能定位。
 */
const noteNativeAnswer = (
    song: SongResult,
    source: string,
    published: boolean,
    lines: number,
    elapsedMs: number,
    failure?: string,
): void => {
    noteLyricsDiagnostic('native:lyric-answer', song, {
        source,
        published,
        lines,
        elapsedMs,
        failure,
    });
};

/** 构建并发布一首歌的时间轴。成功（真的落地了）才记进 primed。 */const publishTimeline = async (song: SongResult, lyrics: LyricData, key: string): Promise<boolean> => {
    const metadata = createProviderSongMetadata(song);
    const built = buildColorOsLyricInfo({
        title: song.name ?? '',
        artist: metadata.artists.map(artist => artist.name).filter(Boolean).join(' / '),
        album: metadata.album.name,
        songId: song.id == null ? null : String(song.id),
        durationMs: Math.max(0, Math.round(song.durationMs ?? metadata.durationMs ?? 0)),
        lines: lyrics.lines,
        isWordByWord: lyrics.isWordByWord === true,
        sessionGeneration: nextColorOsGeneration(),
    });
    if (!built) return false;
    // Mark only what actually landed. Marking before the await meant one failed bridge call
    // (renderer busy, service restarting) permanently retired that song: it was never primed
    // again in this session, so a background auto-advance into it published no timeline at
    // all even though the lyrics were sitting in the cache.
    const published = await publishColorOsLyricInfo(built.lyricInfo, built.hasTranslation, key);
    if (published) markPrimed(key);
    return published;
};

/**
 * 确保某一首的歌词已经在原生缓存里。
 *
 * @param fetch 本地两处都没有时是否允许联网取一次。只给「原生正在播的那一首」开这个口子：
 *              它是唯一确定会被消费的曲目，而整条歌单联网取词会把后台带宽打满。
 * @return 是否真的发布成功（false = 没词 / 没取到 / 原生拒绝）
 */
export const ensureNativeLyric = (
    song: SongResult,
    quality?: AudioQualityPreference,
    options: { fetch?: boolean } = {},
): Promise<boolean> => {
    const key = getPlaybackSongKey(song);
    if (!key || isLocalPlaybackSong(song) || isNavidromePlaybackSong(song)) return Promise.resolve(false);
    if (knownEmpty.includes(key)) return Promise.resolve(false);
    const running = inFlight.get(key);
    if (running) return running;

    const task = (async (): Promise<boolean> => {
        const startedAt = Date.now();
        const cached = await readCachedLyrics(song, quality);
        if (cached) {
            const published = await publishTimeline(song, cached.lyrics, key);
            noteNativeAnswer(song, cached.source, published, cached.lyrics.lines.length, Date.now() - startedAt);
            return published;
        }
        if (!options.fetch) {
            noteNativeAnswer(song, 'not-cached', false, 0, Date.now() - startedAt);
            return false;
        }
        if (activeFetches >= MAX_CONCURRENT_FETCHES) {
            noteNativeAnswer(song, 'busy', false, 0, Date.now() - startedAt);
            return false;
        }
        activeFetches++;
        try {
            const result = await omni.getLyrics(song);
            const fetched = result?.lyrics;
            if (!fetched?.lines?.length) {
                // 服务端明确回答「没有词」：宣告给原生，让它的重问到此为止，也让消费端知道
                // 这不是「还没到」。异常路径不走这里 —— 断网不等于没词。
                knownEmpty.push(key);
                void clearColorOsLyricInfo(key);
                noteNativeAnswer(song, 'confirmed-empty', false, 0, Date.now() - startedAt);
                return false;
            }
            // 落盘：预取从不写歌词缓存，所以「后台补过的这一首」过去在冷启动后又变成没词。
            // 写的是播放器页读的同一个 key，下一次连门都不用出。
            void saveToCache(getSongResourceCacheKey('lyric', song), fetched);
            const published = await publishTimeline(song, fetched, key);
            noteNativeAnswer(song, 'fetch', published, fetched.lines.length, Date.now() - startedAt);
            return published;
        } finally {
            activeFetches--;
        }
    })().catch(error => {
        // 取词抛错（断网 / 音源拒答）不等于「没有词」：保持 pending，等原生的下一次重问。
        noteNativeAnswer(song, 'fetch-failed', false, 0, 0, error instanceof Error ? error.name : 'error');
        return false;
    });

    inFlight.set(key, task);
    void task.finally(() => { inFlight.delete(key); });
    return task;
};

/**
 * Publish the cached timelines of upcoming tracks into the native lyric cache.
 *
 * Safe to call on every refill: tracks already primed are skipped, tracks without cached lyrics
 * are remembered as `wanted` so a lyric that arrives later still lands (see the primer below).
 */
export const primeNativeLyricsForSongs = async (
    songs: SongResult[],
    quality: AudioQualityPreference,
): Promise<void> => {
    for (const song of songs.slice(0, LYRIC_PRIME_AHEAD)) {
        const key = getPlaybackSongKey(song);
        if (!key || isLocalPlaybackSong(song) || isNavidromePlaybackSong(song)) continue;
        if (isPrimed(key)) continue;
        // 先记账再尝试：此刻没有词，不代表以后没有。
        markWanted(key);
        await ensureNativeLyric(song, quality);
    }
};

/**
 * 预取刚把某一首的歌词拿到手。
 *
 * 这是「第二首没词」真正的修复点：预置与预取是两条并行的异步链，谁先完成都有可能。
 * 预置先到时它只能跳过；预取完成这一次通知把缺口补上，不需要等某次渲染，也不需要用户
 * 打开 App —— 只要 JS 还活着，原生缓存就会在这一刻被填好。
 */
export const notifyPrefetchedLyrics = (song: SongResult): void => {
    const key = getPlaybackSongKey(song);
    if (!key || isPrimed(key)) return;
    // 只补「队列窗口声明过的」那些：歌单外的歌没有理由占用原生缓存。
    if (!wanted.includes(key)) return;
    void ensureNativeLyric(song);
};

let uninstallPrimer: (() => void) | null = null;

/** 挂上预取完成的通知监听；重复调用无副作用。 */
export const installNativeLyricPrimer = (): (() => void) => {
    if (uninstallPrimer) return uninstallPrimer;
    if (typeof window === 'undefined') return () => undefined;
    const onPrefetched = (event: Event): void => {
        const song = (event as CustomEvent<{ song?: SongResult } | undefined>).detail?.song;
        if (song) notifyPrefetchedLyrics(song);
    };
    window.addEventListener('tingyu-lyrics-prefetched', onPrefetched);
    uninstallPrimer = () => {
        window.removeEventListener('tingyu-lyrics-prefetched', onPrefetched);
        uninstallPrimer = null;
    };
    return uninstallPrimer;
};

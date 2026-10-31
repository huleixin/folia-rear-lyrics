import React from 'react';
import {
    clearColorOsLyricInfo,
    getColorOsLyricsSupport,
    publishColorOsLyricInfo,
    setLyricVariantRule,
} from '../platform/foliaColorOsLyrics';
import { isCapacitorAndroid } from '../platform/runtime';
import { getSongAlbumLabel, getSongArtistLabel } from '../services/onlineMusic/songMetadata';
import { ensureNativeLyric, installNativeLyricPrimer } from '../services/nativeLyricPriming';
import { nextColorOsGeneration } from '../services/lyricSessionGeneration';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { useLyricSettingsStore } from '../stores/useLyricSettingsStore';
import type { SongResult } from '../types';
import type { LyricData } from '../types';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { buildColorOsLyricInfo } from '../utils/lyrics/colorOsLyricInfo';

// src/hooks/useColorOsLyricFeed.ts
// 沿用历史名称，发布标准 LyricInfo 供 ColorOS 或第三方灵动岛模块消费。
// 只在换歌、时长/歌词补齐时发布；不启动舞台、不逐帧传输，进度沿用 PlaybackState。
//
// 这条通道过去有一个致命时序：换歌时播放器会把 lyrics 置 null，本 hook 立刻 clear()，
// 原生随即在 metadata 里写一个「本曲无歌词」的空时间轴。前台无所谓（新歌词几百毫秒后就到），
// 但后台 WebView 一旦被挂起，新歌词可能几分钟都不来 —— 灵动岛就这样被我们**主动**清空，
// 而且此后再也没有任何东西去补。现在把三种状态分清楚：
//   ready      有词 → 发布（同一首歌补数据不递增代次）
//   pending    还在加载 → 什么都不做，交给原生按 songKey 缓存/留白
//   none       加载完成确实没词 → 只撤掉这一首（绝不能整条清空，会连累预取好的下一首）

type UseColorOsLyricFeedOptions = {
    lyrics: LyricData | null;
    song: SongResult | null;
    /** 时长（秒）。 */
    duration?: number;
    timelineOffsetMs?: number;
    /** 当前这首歌的歌词是否仍在加载。加载中不得宣告「无词」。 */
    lyricsLoading?: boolean;
};

export const useColorOsLyricFeed = ({
    lyrics,
    song,
    duration,
    timelineOffsetMs = 0,
    lyricsLoading = false,
}: UseColorOsLyricFeedOptions): void => {
    const enabled = isCapacitorAndroid();
    const [supported, setSupported] = React.useState(false);

    // 判定每进程只做一次：原生那边要读 ROM 属性（必要时还要跑一次 getprop），
    // 结果在 platform 层缓存，这里只取回来决定要不要启动整条通道。
    React.useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        void getColorOsLyricsSupport().then((result) => {
            if (!cancelled) setSupported(result.supported);
        });
        return () => {
            cancelled = true;
        };
    }, [enabled]);

    // 预取完成的通知出口：预置与预取是两条并行链，谁先完成都有可能。预取这一侧完成时
    // 主动把「队列窗口里还没词的那一首」补进原生缓存 —— 这就是第二首没词的修复点。
    React.useEffect(() => {
        if (!enabled) return;
        return installNativeLyricPrimer();
    }, [enabled]);

    const active = enabled && supported;
    const songKey = song ? getPlaybackSongKey(song) : null;
    const hasLines = Boolean(lyrics?.lines?.length);
    const lyricVariant = useLyricSettingsStore((state) => state.lyricVariant);

    // 统一简繁规则同步给原生：后台独立取词应用同一条规则，避免后台突然出现繁体。
    React.useEffect(() => {
        if (!enabled) return;
        void setLyricVariantRule(lyricVariant);
    }, [enabled, lyricVariant]);

    /** 上一首发布过的身份：同一首歌的补齐不换代次，真换歌才递增。 */
    const publishedKeyRef = React.useRef<string | null>(null);
    const generationRef = React.useRef<{ key: string | null; value: number }>({ key: null, value: 0 });
    /** 同一首歌复用同一个代次（补齐数据不能"变旧"），换歌才取新号。 */
    const generationFor = (key: string): number => {
        if (generationRef.current.key !== key) {
            generationRef.current = { key, value: nextColorOsGeneration() };
        }
        return generationRef.current.value;
    };

    /**
     * 原生问的那一首不一定是 UI 正在显示的那一首（后台已自动换歌，React 还停在上一次渲染）。
     *
     * 只读本地持久缓存（IndexedDB / 预取内存），**不联网**：这条路径的语义是「把已经有的
     * 时间轴补过去」，不是重新跑一遍取词。拿不到就什么都不做 —— 留白比写一个错的强。
     */
    const answerFor = async (key: string, allowFetch: boolean): Promise<void> => {
        const queue = usePlaybackStore.getState().playQueue ?? [];
        // 界面停在上一首是常态：身份必须来自原生问的那一首，而不是 React 正在渲染的那一首。
        const target = queue.find(item => getPlaybackSongKey(item) === key)
            ?? (songKey === key ? song : null);
        if (!target) return;
        // 复用播放器页的取词/缓存/发布链路（nativeLyricPriming），而不是在这里再写一套：
        // 预取内存 → IndexedDB → （允许时）联网取一次并落盘。旧实现只读 IndexedDB，
        // 而预取拿到的歌词从不写盘，于是「预取成功」在后台等于没有。
        await ensureNativeLyric(target, undefined, { fetch: allowFetch });
    };

    React.useEffect(() => {
        if (!active) return;
        // 没有在播的歌：整条通道作废（停止播放）。
        if (!songKey) {
            publishedKeyRef.current = null;
            void clearColorOsLyricInfo();
            return;
        }
        if (!hasLines) {
            // 还在加载：什么都不声明。原生按 songKey 查自己的缓存，查不到就不写 lyricInfo，
            // 消费端看到的是「等待补充」而不是「没有歌词」。
            if (lyricsLoading || !usePlaybackStore.getState().audioSrc) return;
            // 加载完成且确实没词：只撤掉这一首。
            publishedKeyRef.current = null;
            void clearColorOsLyricInfo(songKey);
            return;
        }
        const built = buildColorOsLyricInfo({
            title: song?.name ?? '',
            artist: song ? getSongArtistLabel(song) : '',
            album: song ? getSongAlbumLabel(song) : '',
            songId: song?.id == null ? null : String(song.id),
            durationMs: Math.max(0, Math.round((duration ?? 0) * 1000)),
            lines: lyrics!.lines,
            isWordByWord: lyrics!.isWordByWord === true,
            sessionGeneration: generationFor(songKey),
            timelineOffsetMs,
        });
        if (!built) {
            publishedKeyRef.current = null;
            void clearColorOsLyricInfo(songKey);
            return;
        }
        publishedKeyRef.current = songKey;
        // songKey 必须一起过去：原生按它存/取，对不上就自然拿不到上一首的词 ——
        // 「旧异步结果覆盖新歌」正是协议点名要防的。
        // hasWordByWord 一并交给统一仓库记录，供诊断判断逐字 lane 的来源层级。
        void publishColorOsLyricInfo(built.lyricInfo, built.hasTranslation, songKey, {
            hasWordByWord: lyrics!.isWordByWord === true,
            source: 'stage',
        });
    }, [active, songKey, song, lyrics, hasLines, lyricsLoading, duration, timelineOffsetMs]);

    // 回到前台再推一次：原生进程若被回收过，缓存是空的，而这段 payload 还在 WebView 里。
    React.useEffect(() => {
        // 监听器**不能**依附于「界面这一首有词」：锁屏自动切歌时 React 常常还停在一首
        // 没有词/正在加载的歌上，而原生问的是另一首 —— 监听器不挂，询问就被整条丢掉，
        // 灵动岛一直空着，直到用户打开 App。挂载条件只保留「通道可用且知道有歌」。
        if (!active || !songKey) return;
        const build = () => (hasLines ? buildColorOsLyricInfo({
            title: song?.name ?? '',
            artist: song ? getSongArtistLabel(song) : '',
            album: song ? getSongAlbumLabel(song) : '',
            songId: song?.id == null ? null : String(song.id),
            durationMs: Math.max(0, Math.round((duration ?? 0) * 1000)),
            lines: lyrics!.lines,
            isWordByWord: lyrics!.isWordByWord === true,
            sessionGeneration: generationFor(songKey),
            timelineOffsetMs,
        }) : null);
        const republish = () => {
            if (document.visibilityState !== 'visible') return;
            if (publishedKeyRef.current !== songKey) return;
            const built = build();
            if (built) {
                // 重推的是舞台当前确认的同一份内容：统一仓库里已是这条记录（层级 stage），
                // 原生 setPending 按内容去重，灵动岛/背屏不会因此换版本 ——
                // 这是「打开主界面歌词换版本」问题的收敛点。
                void publishColorOsLyricInfo(built.lyricInfo, built.hasTranslation, songKey, {
                    hasWordByWord: lyrics!.isWordByWord === true,
                    source: 'stage',
                });
            }
        };
        /**
         * 原生侧「这首歌我还没有时间轴」的请求。
         *
         * Media3 在后台自动换歌时，若这首歌的歌词没有被预置过，原生只能先不写 lyricInfo，
         * 随后（有界地）再问一次。这里必须真的能补上：
         *   - 界面还停在上一首 → 用**被问的那一首**的身份去补（不是当前渲染的那一首）；
         *   - 本地两处都没有 → 允许联网取一次并落盘，这是「后台独立补词」的唯一入口；
         *   - 界面这一首就有词 → 直接用这份 payload 作答（带时间轴偏移，最贴近舞台）。
         */
        const onNativeRequest = (event: Event) => {
            const requested = (event as CustomEvent<{ songKey?: string } | undefined>).detail?.songKey;
            if (requested && requested !== songKey) {
                void answerFor(requested, true);
                return;
            }
            const built = build();
            if (built) {
                publishedKeyRef.current = songKey;
                void publishColorOsLyricInfo(built.lyricInfo, built.hasTranslation, songKey, {
                    hasWordByWord: lyrics!.isWordByWord === true,
                    source: 'stage',
                });
                return;
            }
            // 界面这一首自己也没词：仍然按它的身份去补一次，别让请求掉在地上。
            void answerFor(songKey, true);
        };
        document.addEventListener('visibilitychange', republish);
        window.addEventListener('tingyu-native-lyric-request', onNativeRequest);
        return () => {
            document.removeEventListener('visibilitychange', republish);
            window.removeEventListener('tingyu-native-lyric-request', onNativeRequest);
        };
    }, [active, songKey, song, lyrics, hasLines, duration, timelineOffsetMs]);
};

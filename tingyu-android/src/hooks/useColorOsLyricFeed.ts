import React from 'react';
import {
    clearColorOsLyricInfo,
    getColorOsLyricsSupport,
    publishColorOsLyricInfo,
} from '../platform/foliaColorOsLyrics';
import { isCapacitorAndroid } from '../platform/runtime';
import { getSongAlbumLabel, getSongArtistLabel } from '../services/onlineMusic/songMetadata';
import { nextColorOsGeneration } from '../services/lyricSessionGeneration';
import { usePlaybackStore } from '../stores/usePlaybackStore';
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

    const active = enabled && supported;
    const songKey = song ? getPlaybackSongKey(song) : null;
    const hasLines = Boolean(lyrics?.lines?.length);

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
        void publishColorOsLyricInfo(built.lyricInfo, built.hasTranslation, songKey);
    }, [active, songKey, song, lyrics, hasLines, lyricsLoading, duration, timelineOffsetMs]);

    // 回到前台再推一次：原生进程若被回收过，缓存是空的，而这段 payload 还在 WebView 里。
    React.useEffect(() => {
        if (!active || !songKey || !hasLines) return;
        const build = () => buildColorOsLyricInfo({
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
        const republish = () => {
            if (document.visibilityState !== 'visible') return;
            if (publishedKeyRef.current !== songKey) return;
            const built = build();
            if (built) void publishColorOsLyricInfo(built.lyricInfo, built.hasTranslation, songKey);
        };
        /**
         * 原生侧「这首歌我还没有时间轴」的请求。
         *
         * Media3 在后台自动换歌时，若这首歌的歌词没有被预置过（锁屏期间 WebView 不跑，
         * 无法自己补），原生只能先不写 lyricInfo。等 JS 真的活过来时它会主动来问一次，
         * 这里必须回答 —— 否则灵动岛会一直空到下一次换歌。
         */
        const onNativeRequest = (event: Event) => {
            const requested = (event as CustomEvent<{ songKey?: string } | undefined>).detail?.songKey;
            if (requested && requested !== songKey) return;
            const built = build();
            if (!built) return;
            publishedKeyRef.current = songKey;
            void publishColorOsLyricInfo(built.lyricInfo, built.hasTranslation, songKey);
        };
        document.addEventListener('visibilitychange', republish);
        window.addEventListener('tingyu-native-lyric-request', onNativeRequest);
        return () => {
            document.removeEventListener('visibilitychange', republish);
            window.removeEventListener('tingyu-native-lyric-request', onNativeRequest);
        };
    }, [active, songKey, song, lyrics, hasLines, duration, timelineOffsetMs]);
};

import { registerPlugin } from '@capacitor/core';

// src/platform/foliaColorOsLyrics.ts
// 历史插件名保持兼容；LyricInfo 现在发布到所有 Android ROM 的同一个 MediaSession。
// ColorOS 可原生消费，HyperOS 灵动岛等界面需另装支持 LyricInfo 的显示模块。
// supported 只代表播放器支持发布，不代表系统已安装接收模块或已显示歌词。

export interface ColorOsLyricsSupport {
    supported: boolean;
    /** 解析出来的 ColorOS 大版本；0 = 没读出来。 */
    colorOsMajor: number;
    /** 判定依据（属性名 / 兜底原因），只用于诊断日志。 */
    detail: string;
}

interface FoliaColorOsLyricsPlugin {
    isSupported(): Promise<ColorOsLyricsSupport>;
    publish(options: {
        lyricInfo: string;
        hasTranslation: boolean;
        /** 与通知栏同一个歌曲身份；对不上时原生会拒绝这段歌词。 */
        songKey?: string | null;
    }): Promise<{ ok: boolean }>;
    clear(options?: { songKey?: string | null }): Promise<void>;
    status(options?: { songKey?: string | null }): Promise<{ state: string; detail: string }>;
}

const FoliaColorOsLyrics = registerPlugin<FoliaColorOsLyricsPlugin>('FoliaColorOsLyrics');

const NOT_SUPPORTED: ColorOsLyricsSupport = { supported: false, colorOsMajor: 0, detail: 'unavailable' };

let cachedSupport: ColorOsLyricsSupport | null = null;

/**
 * 这台机器走不走 ColorOS 原生歌词通道。
 *
 * 结果缓存起来：判定要读 ROM 属性，一次就够，不必每首歌问一遍。
 * 拿不到答案（没装原生插件 / 插件没注册）一律按「不支持」处理 —— 不是那台机器，
 * 这条路就该安静地不存在。
 */
export const getColorOsLyricsSupport = async (): Promise<ColorOsLyricsSupport> => {
    if (cachedSupport) return cachedSupport;
    try {
        const result = await FoliaColorOsLyrics.isSupported();
        cachedSupport = {
            supported: Boolean(result?.supported),
            colorOsMajor: Number(result?.colorOsMajor ?? 0),
            detail: String(result?.detail ?? ''),
        };
    } catch {
        cachedSupport = NOT_SUPPORTED;
    }
    return cachedSupport;
};

export const publishColorOsLyricInfo = async (
    lyricInfo: string,
    hasTranslation: boolean,
    songKey: string | null,
): Promise<boolean> => {
    try {
        const result = await FoliaColorOsLyrics.publish({ lyricInfo, hasTranslation, songKey });
        return Boolean(result?.ok);
    } catch {
        return false;
    }
};

/**
 * 撤掉歌词。
 *
 * 带 songKey = 只宣告「这一首没有词」，原生给这一首写空时间轴，已经预取好的下一首不受影响。
 * 不带 = 整条通道作废（停止播放）。
 */
export const clearColorOsLyricInfo = async (songKey?: string | null): Promise<void> => {
    try {
        await FoliaColorOsLyrics.clear(songKey ? { songKey } : undefined);
    } catch {
        // 同上。
    }
};

/** 诊断用：这一首的歌词在原生侧是什么状态（ready / none / pending）。 */
export const readColorOsLyricState = async (songKey?: string | null): Promise<string> => {
    try {
        const result = await FoliaColorOsLyrics.status(songKey ? { songKey } : undefined);
        return String(result?.state ?? 'unknown');
    } catch {
        return 'unavailable';
    }
};

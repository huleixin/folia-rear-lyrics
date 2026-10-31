import OpenCC from 'opencc-js';
import type { LyricData } from '../../types';

// src/utils/lyrics/variant.ts
// 统一简繁规则。三端（歌词舞台 / 背屏 / 灵动岛）共用同一条规则转换后的同一份歌词：
// 转换只发生在歌词进入 App 的唯一入口（createLyricsSetter）——舞台显示与原生发布
// 派生自同一个 state，因此不会出现「舞台简体、灵动岛繁体」。
//
// 规则只有 off / t2s 两种。t2s 用 opencc-js（与匹配打分同一条转换链）。
// 原生后台独立取词侧由 LyricVariantConverter 应用同一条规则（单字表，opencc 数据导出）。

export type LyricVariantRule = 'off' | 't2s';

export const LYRIC_VARIANT_STORAGE_KEY = 'lyric_variant';

export const normalizeLyricVariantRule = (value: unknown): LyricVariantRule =>
    value === 't2s' ? 't2s' : 'off';

export const readStoredLyricVariant = (): LyricVariantRule => {
    if (typeof window === 'undefined') return 'off';
    return normalizeLyricVariantRule(localStorage.getItem(LYRIC_VARIANT_STORAGE_KEY));
};

let t2sConverter: ((text: string) => string) | null = null;

const getT2SConverter = (): ((text: string) => string) => {
    if (!t2sConverter) {
        t2sConverter = OpenCC.Converter({ from: 't', to: 'cn' });
    }
    return t2sConverter;
};

/** 转换一段文本；off / 空文本原样返回。 */
export const convertLyricText = (text: string, rule: LyricVariantRule): string => {
    if (rule !== 't2s' || !text) return text;
    try {
        return getT2SConverter()(text);
    } catch {
        return text;
    }
};

/**
 * 对一份歌词数据整体应用简繁规则：逐行文本、逐字词、翻译、用户保存的分词边界
 * 全部走同一条转换，保持 words/wordSegments 与 fullText 的对齐关系。
 * 转换是幂等的：t2s 不改变已是简体的文本。
 */
export const applyLyricVariantToData = (
    data: LyricData | null,
    rule: LyricVariantRule,
): LyricData | null => {
    if (!data || rule === 'off' || !data.lines?.length) return data;
    const lines = data.lines.map((line) => {
        const fullText = convertLyricText(line.fullText, rule);
        const translation = line.translation ? convertLyricText(line.translation, rule) : line.translation;
        const words = line.words?.length
            ? line.words.map((word) => ({ ...word, text: convertLyricText(word.text, rule) }))
            : line.words;
        const wordSegments = line.wordSegments?.length
            ? line.wordSegments.map((segment) => convertLyricText(segment, rule))
            : line.wordSegments;
        const autoWordSegments = line.autoWordSegments?.length
            ? line.autoWordSegments.map((segment) => convertLyricText(segment, rule))
            : line.autoWordSegments;
        return { ...line, fullText, translation, words, wordSegments, autoWordSegments };
    });
    return { ...data, lines };
};

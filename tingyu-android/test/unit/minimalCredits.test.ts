// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isProductionCreditLine } from '@/components/app/overlays/minimal-stage/minimalLyrics';
import type { Line } from '@/types';

// test/unit/theme/../minimalCredits.test.ts
// The minimal lyric page draws production credits at caption weight. The risk is not missing a credit
// — an oversized credit line is ugly but honest — it is demoting a line of the song. So the cases
// below are mostly *negative*: every real lyric form this page is likely to meet must stay a lyric.

const line = (text: string): Line => ({ fullText: text, startTime: 0, endTime: 1, words: [] } as Line);
const credit = (text: string, index = 0) => isProductionCreditLine(line(text), index);
const lyric = (text: string, index = 4) => isProductionCreditLine(line(text), index);

describe('recognised as production information', () => {
    it('reads the common labelled heads, simplified and traditional', () => {
        for (const text of [
            '作词：李焯雄', '作詞：李焯雄', '作曲：梁翘柏', '编曲：梁翘柏', '編曲：梁翹柏',
            '制作人：梁翘柏', '製作人：梁翹柏', '监制：陈奕迅', '和声：某人', '混音：某人',
            '填词：林夕', '母带：某工作室', '统筹：某公司', '出品：某唱片',
            // The short forms a real LRC head uses, taken from a device report.
            '词：李焯雄', '曲：梁翘柏', '詞：李焯雄',
        ]) {
            expect(credit(text), text).toBe(true);
        }
    });

    it('reads the English forms and bracketed ones', () => {
        for (const text of [
            'Lyricist: Li Zhuoxiong', 'Composer: Liang Qiaobai', 'Arranged by Liang',
            'Produced by Someone', 'OP：某唱片', '（作词：李焯雄）', '【作曲】梁翘柏',
        ]) {
            expect(credit(text), text).toBe(true);
        }
    });

    it('reads a first line that is the song title and the artist', () => {
        expect(credit('红玫瑰 - 陈奕迅 (Eason Chan)', 0)).toBe(true);
        expect(credit('Someone Like You - Adele', 0)).toBe(true);
    });

    it('stays out of the way of real lyrics at any position', () => {
        // Every one of these is a line someone sings.
        for (const text of [
            '作词家一样的夜晚', '作曲的人还在写', '吉他上还有你的味道', '鼓声一点点消失',
            '所有刺激剩下疲乏的痛', '再无动于衷', '从背后抱你的时候', '期待的却是他的面容',
            '红玫瑰 - 陈奕迅 (Eason Chan)', 'Lyricist of my own heart', '制作人一样的我',
        ]) {
            expect(lyric(text), text).toBe(false);
        }
    });

    it('keeps a sung line that merely ends with a credit word', () => {
        expect(lyric('我把回忆写成歌词，')).toBe(false);
        expect(lyric('你是我的制作人。')).toBe(false);
    });

    it('ignores long lines and lines with sung punctuation, whatever they start with', () => {
        expect(credit('作词：这是一段很长的文字它看起来更像一句歌词而不是一个名单所以不应该是制作信息', 0)).toBe(false);
        expect(credit('作曲：梁翘柏，')).toBe(false);
    });

    it('only trusts the dash form on the first line', () => {
        expect(credit('红玫瑰 - 陈奕迅', 7)).toBe(false);
        expect(credit('我等的船 - 还不来', 7)).toBe(false);
    });

    it('never rewrites anything: the line object is untouched', () => {
        const value = line('作词：李焯雄');
        isProductionCreditLine(value, 0);
        expect(value.fullText).toBe('作词：李焯雄');
        expect(value.startTime).toBe(0);
        expect(value.endTime).toBe(1);
    });
});

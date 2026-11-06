// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildColorOsLyricInfo, hasUsableLyricTimeline } from '../../../src/utils/lyrics/colorOsLyricInfo';
import type { Line } from '../../../src/types';

// test/unit/lyrics/localLyricsTimeline.test.ts
// 同步规则：有逐行时间轴就发逐行 LRC；只有纯文本歌词时不伪装成同步歌词。

const base = {
    title: '茶花开了', artist: '王睿卓', album: '专辑A', songId: 'local:s1',
    durationMs: 269_000, sessionGeneration: 1,
};

describe('本地歌词的时间轴发布', () => {
    it('有逐行时间信息时正常发布逐行同步歌词', () => {
        const lines = [
            { startTime: 0, fullText: '那是一座座山连着山的小村庄' },
            { startTime: 12.5, fullText: '那是一湾湾水绕着水的小河塘' },
        ] as Line[];
        const built = buildColorOsLyricInfo({ ...base, lines, isWordByWord: false });
        expect(built).not.toBeNull();
        const info = JSON.parse(built!.lyricInfo) as { lyric?: string };
        expect(info.lyric).toContain('[00:00.000]');
        expect(info.lyric).toContain('[00:12.500]');
        expect(info.lyric).toContain('小村庄');
        expect(built!.hasTranslation).toBe(false);
    });

    it('纯文本歌词被识别为「无时间轴」，本地歌据此不发布假同步词（在线歌行为不变）', () => {
        const lines = [
            { startTime: 0, fullText: '第一段纯文本' },
            { startTime: 0, fullText: '第二段纯文本' },
            { startTime: 0, fullText: '第三段纯文本' },
        ] as Line[];
        expect(hasUsableLyricTimeline({ lines } as never)).toBe(false);
        // 通用构建器仍按原语义工作：判断放在本地歌的调用方，避免误伤在线单行歌词。
        expect(buildColorOsLyricInfo({ ...base, lines })).not.toBeNull();
        const timed = [
            { startTime: 0, fullText: '第一句' },
            { startTime: 12.5, fullText: '第二句' },
        ] as Line[];
        expect(hasUsableLyricTimeline({ lines: timed } as never)).toBe(true);
    });

    it('空歌词返回 null，由调用方显示既有「无歌词」状态', () => {
        expect(buildColorOsLyricInfo({ ...base, lines: [] })).toBeNull();
    });

    it('逐字时间信息存在时保留 rawLyric lane，不伪造逐字数据', () => {
        const lines = [
            { startTime: 10, fullText: '逐字这句', words: [
                { text: '逐', startTime: 10, endTime: 10.4 },
                { text: '字', startTime: 10.4, endTime: 10.9 },
            ] },
            { startTime: 20, fullText: '下一句' },
        ] as unknown as Line[];
        const withWords = buildColorOsLyricInfo({ ...base, lines, isWordByWord: true });
        const without = buildColorOsLyricInfo({ ...base, lines, isWordByWord: false });
        expect(withWords).not.toBeNull();
        expect(without).not.toBeNull();
        // 没有逐字标记时不应凭空生成 rawLyric。
        const plain = JSON.parse(without!.lyricInfo) as Record<string, string>;
        expect(plain.rawLyric ?? '').toBe('');
    });
});

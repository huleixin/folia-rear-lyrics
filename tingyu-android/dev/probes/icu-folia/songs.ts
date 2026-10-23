import type { Line } from '../../../src/types';

// dev/probes/icu-folia/songs.ts
// Whole Chinese songs for comparing the old default split (Intl.Segmenter) with icu-folia.
//
// 《送别》 is Li Shutong's 1915 lyric (public domain), a real song from start to end. 《晚风信》 was
// written for this probe in the style of a modern pop lyric, so it carries what 《送别》's classical
// diction does not: particles (的/了/着/地/吗), reduplication, idioms, a 的话 clause, interjections and
// vocables. Neither is quoted from a copyrighted song.

export interface ProbeSong {
    id: string;
    title: string;
    /** Sections of lines; a gap is left between sections, as between verses of a real song. */
    sections: string[][];
}

export const SONGS: ProbeSong[] = [
    {
        id: 'songbie',
        title: '送别（李叔同）',
        sections: [
            ['长亭外', '古道边', '芳草碧连天', '晚风拂柳笛声残', '夕阳山外山'],
            ['天之涯', '地之角', '知交半零落', '一壶浊酒尽余欢', '今宵别梦寒'],
            ['长亭外', '古道边', '芳草碧连天', '问君此去几时来', '来时莫徘徊'],
        ],
    },
    {
        id: 'wanfeng',
        title: '晚风信',
        sections: [
            ['街角的路灯又亮起来了', '我把今天的心事折进口袋', '你说过的话还留在耳边', '像一场下不完的小雨'],
            ['我们慢慢地走过那条长长的街', '风轻轻地吹乱了你的头发', '那年我们十七岁', '以为时间会一直这样停着'],
            ['啊 晚风啊', '请替我把思念带给远方的你', '如果可以的话', '我想再陪你看一次海', '千言万语都说不出口', '只剩下一句我想你'],
            ['后来终于在人山人海里明白', '有些人一旦走散了就不会再回来', '城市的灯火一盏一盏地熄灭', '我还站在原地等着'],
            ['啊 晚风啊', '请替我把思念带给远方的你', '如果可以的话', '我想再陪你看一次海', '千言万语都说不出口', '只剩下一句我想你'],
            ['啦啦啦 啦啦啦', '晚安 我的少年'],
        ],
    },
];

const INTRO_SECONDS = 4;
const SECTION_GAP_SECONDS = 3;
const LINE_GAP_SECONDS = 0.3;

/** Karaoke-style timing: one parser word per character, the line's length setting its duration. */
export const buildSongLines = (song: ProbeSong): Line[] => {
    const lines: Line[] = [];
    let time = INTRO_SECONDS;
    song.sections.forEach((section, sectionIndex) => {
        section.forEach(fullText => {
            const chars = Array.from(fullText);
            const duration = 1 + chars.length * 0.26;
            const step = duration / chars.length;
            lines.push({
                id: `line-${lines.length}`,
                startTime: time,
                endTime: time + duration,
                fullText,
                words: chars.map((text, offset) => ({
                    text,
                    startTime: time + offset * step,
                    endTime: text.trim() ? time + (offset + 1) * step : time + offset * step,
                })),
                isChorus: song.id === 'wanfeng' && (sectionIndex === 2 || sectionIndex === 4),
            });
            time += duration + LINE_GAP_SECONDS;
        });
        time += SECTION_GAP_SECONDS;
    });
    return lines;
};

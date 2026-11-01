import { describe, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../../src/platform/runtime', () => ({ isCapacitorAndroid: () => true }));
vi.mock('../../../src/platform/tingyuPlayback', () => ({
    getTingyuPlayback: () => ({ resourceSnapshot: async (value: Record<string, unknown>) => { calls.push(value); } }),
}));
import { syncPlaylistResources, resourceSnapshotIdentity } from '../../../src/services/playlistResourceSnapshot';
import { decodeSharedLyricInfo } from '../../../src/services/sharedSongResources';
import { buildColorOsLyricInfo } from '../../../src/utils/lyrics/colorOsLyricInfo';

// test/unit/services/sharedSongResources.test.ts
describe('whole playlist resource snapshot', () => {
    it.each([30,100,396,500,1001])('sends all %i songs in bounded serial pages', async count => {
        calls.length = 0;
        const songs = Array.from({ length: count }, (_, i) => ({
            songKey: 'qq:'+i, providerId:'qq',mediaId:String(i),title:'song',artist:'artist',
            album:'album',durationMs:200000,artwork:'https://example.org/'+i,
        }));
        await syncPlaylistResources(songs, song => song, songs[20].songKey);
        const pages = calls.filter(c => !c.begin);
        expect(pages.flatMap(c => c.tracks as unknown[])).toHaveLength(count);
        expect(pages.every(c => (c.tracks as unknown[]).length <= 50)).toBe(true);
        expect(pages.at(-1)?.finish).toBe(true);
        expect(calls[0].begin).toBe(true);
    });
    it('resource identity changes when resource version changes', () => {
        expect(resourceSnapshotIdentity(['qq:1|a'])).not.toBe(resourceSnapshotIdentity(['qq:1|b']));
    });
});
describe('raw authoritative timeline', () => {
    it('roundtrips words and translation without baking a user offset', () => {
        const built = buildColorOsLyricInfo({
            title:'Song',durationMs:10000,isWordByWord:true,
            lines:[{startTime:1,endTime:3,fullText:'hello world',translation:'你好',
                words:[{text:'hello ',startTime:1,endTime:2},{text:'world',startTime:2,endTime:3}]}],
        });
        expect(built).not.toBeNull();
        const data=decodeSharedLyricInfo(built!.lyricInfo)!;
        expect(data.lines[0].startTime).toBe(1);
        expect(data.lines[0].words[1].startTime).toBe(2);
        expect(data.lines[0].translation).toBe('你好');
        expect(data.isWordByWord).toBe(true);
    });
    it('rejects corrupt and missing timelines', () => {
        expect(decodeSharedLyricInfo('{')).toBeNull();
        expect(decodeSharedLyricInfo('{}')).toBeNull();
    });
});

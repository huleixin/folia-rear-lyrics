import { describe, expect, it } from 'vitest';
import { privateLibrarySongs } from '../../../src/library/core/model/privateLibrarySongs';
import type { SongResult } from '../../../src/types';
import type { ListeningSessionRecord } from '../../../src/types/listeningStatistics';

// test/unit/library/privateLibrarySongs.test.ts
const song = (provider: string, name: string): SongResult => ({ id: 1, name, durationMs: 200000,
    artists: [{ id: 1, name: '歌手' }], album: { id: 1, name: '专辑' }, sourceRef: { kind: 'online', providerId: provider, mediaId: '1' } });
const a = song('netease', 'ＡＢＣ'), b = song('qq', '另一个版本');
const record = (song: SongResult, startedAt: number) => ({ song, startedAt } as ListeningSessionRecord);
describe('private library scope', () => {
    it('only lists explicitly liked songs and matches supplied private metadata', () => {
        const result = privateLibrarySongs([{ song: a, liked: true }, { song: b }], [], 'abc');
        expect(result.liked).toEqual([a]); expect(result.matches).toEqual([a]);
        expect(privateLibrarySongs([{ song: a }], [], '不存在').matches).toEqual([]);
    });
    it('deduplicates recent plays by playback identity without conflating platform ids', () => {
        expect(privateLibrarySongs([], [record(a, 1), record(b, 3), record(a, 2)]).recent).toEqual([b, a]);
    });
});

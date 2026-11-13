import { describe, expect, it } from 'vitest';
import { normalizeQqSong } from '../../src/services/onlineMusic/qqNormalize';
import { mergeQQSearchEnrich } from '../../src/nativeBridge/api/qq.js';

// The bridge's liked-songs path returns enriched rows shaped like this. If the
// normalizer drops the name, the library renders rows with no title.
describe('normalizeQqSong for liked songs', () => {
    it('keeps the enriched metadata produced by the liked-songs path', () => {
        const song = normalizeQqSong({
            mid: '0039MnYb0qxYhV',
            songmid: '0039MnYb0qxYhV',
            id: 889910,
            name: '晴天',
            title: '晴天',
            artist: '周杰伦',
            artists: [{ name: '周杰伦', mid: '0025NhlN2yWrP4' }],
            album: '叶惠美',
            albumMid: '000MkMni19ClKG',
            duration: 269000,
            mediaMid: '0039MnYb0qxYhV',
            fee: 0,
            playable: false,
            provider: 'qq',
        });

        expect(song.name).toBe('晴天');
        expect(song.artists?.map(artist => artist.name)).toEqual(['周杰伦']);
        expect(song.album?.name).toBe('叶惠美');
        expect(song.sourceRef).toMatchObject({ kind: 'online', providerId: 'qq' });
    });
});

// The liked-songs path starts from bare `{ mid, id }` rows and relies on the
// merge to receive the display fields; before the fix every row rendered as an
// unnamed song, which looked like an empty library.
describe('mergeQQSearchEnrich', () => {
    it('copies display fields onto a bare liked-songs row', () => {
        const row: Record<string, unknown> = { mid: '0039MnYb0qxYhV', songmid: '0039MnYb0qxYhV', id: 889910 };
        mergeQQSearchEnrich(row, {
            mid: '0039MnYb0qxYhV',
            name: '晴天',
            artist: '周杰伦',
            artists: [{ name: '周杰伦' }],
            album: '叶惠美',
            albumMid: '000MkMni19ClKG',
            mediaMid: '0039MnYb0qxYhV',
            duration: 269000,
            fee: 0,
        });

        expect(row.name).toBe('晴天');
        expect(row.artist).toBe('周杰伦');
        expect(row.album).toBe('叶惠美');
        expect(row.duration).toBe(269000);
        expect(row.mediaMid).toBe('0039MnYb0qxYhV');

        const song = normalizeQqSong(row);
        expect(song.name).toBe('晴天');
        expect(song.album?.name).toBe('叶惠美');
        expect(song.artists?.map(artist => artist.name)).toEqual(['周杰伦']);
    });
    it('keeps a Dolby variant from a fresh per-song detail response', () => {
        const row: Record<string, unknown> = { mid: '004Fs2FP1EvZYc', name: '晴天 (Live)', artist: '周杰伦' };
        mergeQQSearchEnrich(row, {
            mid: '004Fs2FP1EvZYc', name: '晴天 (Live)', artist: '周杰伦',
            file: { size_flac: 54393782, size_dolby: 13997445, size_dts: 0 },
            pay: { pay_month: 1 },
        });
        expect(row.file).toEqual({ size_flac: 54393782, size_dolby: 13997445, size_dts: 0 });
        expect(row.catalogAccess).toBeUndefined();
        const song = normalizeQqSong(row);
        expect(song.catalogAudioSpecs).toEqual(['lossless', 'dolby']);
        expect(song.catalogAccess).toBe('vip');
    });
});

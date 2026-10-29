// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { qqCatalogAudioFields, neteaseCatalogAudioFields, kugouCatalogAudioFields } from '@/services/onlineMusic/catalogAudioSpecs';
import { normalizeCatalogAudioSpecs } from '@/types/catalogAudioSpecs';
import { normalizeQqSong } from '@/services/onlineMusic/qqNormalize';
import { mapQQTrack } from '@/nativeBridge/api/qq';
import { neteaseApi } from '@/services/netease';
import { getCatalogAudioLabels } from '@/utils/catalogAudioLabels';

// test/unit/onlineMusic/catalogAudioSpecs.test.ts
afterEach(() => vi.unstubAllGlobals());
describe('catalog specifications are independent of selected playback quality', () => {
    it('preserves named QQ sizes through the Android bridge and canonical cache hydration', () => {
        // Named fields observed in the public music.pf_song_detail_svr response; no cookie used.
        const raw = { mid: 'catalog-mid', name: 'Song', interval: 200, file: {
            media_mid: 'media', size_flac: 32695409, size_320mp3: 11611130,
            size_hires: 0, size_dts: 0, size_dolby: 0, size_new: [191257082], url: 'https://never-retain.test/audio',
        } };
        const bridged = mapQQTrack(raw, {});
        expect(bridged.file).toEqual({ size_320mp3: 11611130, size_flac: 32695409 });
        const normalized = normalizeQqSong(bridged);
        expect(normalized.catalogAudioSpecs).toEqual(['lossless']);
        expect(normalizeQqSong(JSON.parse(JSON.stringify(normalized)))).toEqual(normalized);
        expect(JSON.stringify(normalized)).not.toContain('never-retain');
    });
    it('prefers the highest explicit format and retains distinct immersive formats', () => {
        expect(qqCatalogAudioFields({ file: { size_320mp3: 10, size_flac: 20, size_hires: 30, size_dolby: 40, size_dts: 50 } }))
            .toEqual({ catalogAudioSpecs: ['hires', 'dolby', 'dts'] });
        expect(qqCatalogAudioFields({ file: { size_ape: 5 } })).toEqual({ catalogAudioSpecs: ['lossless'] });
    });
    it('does not infer specifications from VIP, playback preferences, title, URLs or unknown flags', () => {
        expect(qqCatalogAudioFields({ name: 'Hi-Res Dolby DTS:X', fee: 1, quality: 'hires',
            url: 'https://test/audio.flac', file: { size_new: [99999] }, sa: 1024 })).toEqual({});
        expect(qqCatalogAudioFields({ file: { size_hires: true, size_flac: 'invalid', size_dolby: -1, size_dts: Infinity } })).toEqual({});
    });
    it('does not preserve obsolete cached capability when a fresh explicit response removes it', () => {
        expect(qqCatalogAudioFields({ catalogAudioSpecs: ['hires', 'dolby'], file: { size_hires: 0, size_dolby: 0, size_320mp3: 5 } }))
            .toEqual({ catalogAudioSpecs: ['high'] });
    });
    it('normalizes Netease named catalog variants before the raw fields are discarded', () => {
        const song = neteaseApi.normalizeSongResult({ id: 7, name: 'Song', ar: [{ id: 1, name: 'Artist' }], al: { id: 3, name: 'Album' }, dt: 200000,
            hr: { br: 1999000, size: 80000000 }, sq: { br: 999000, size: 30000000 } });
        expect(song.catalogAudioSpecs).toEqual(['hires']);
        expect(neteaseApi.normalizeSongResult(JSON.parse(JSON.stringify(song))).catalogAudioSpecs).toEqual(['hires']);
        expect(neteaseCatalogAudioFields({ simpleSong: { sq: { size: 12 } } })).toEqual({ catalogAudioSpecs: ['lossless'] });
        expect(neteaseCatalogAudioFields({ h: { size: 12, br: 320000 } })).toEqual({ catalogAudioSpecs: ['high'] });
    });
    it('requires a real variant rather than inferring lossless or high resolution from bitrate alone', () => {
        expect(neteaseCatalogAudioFields({ privilege: { maxbr: 1999000 }, bitrate: 1999000, hr: { br: 1999000, size: 0 } })).toEqual({});
        expect(neteaseCatalogAudioFields({ h: { size: 20, br: 128000 } })).toEqual({});
    });
    it('recognizes existing Kugou alternate hashes but rejects placeholders', () => {
        expect(kugouCatalogAudioFields({ hashSq: 'a'.repeat(32), hash320: 'b'.repeat(32) })).toEqual({ catalogAudioSpecs: ['lossless'] });
        expect(kugouCatalogAudioFields({ audio_info: { hash_320: 'b'.repeat(32) } })).toEqual({ catalogAudioSpecs: ['high'] });
        expect(kugouCatalogAudioFields({ hashSq: '0'.repeat(32), hash320: 'not-a-real-hash', quality: 'hires' })).toEqual({});
    });
    it('bounds malformed cached input and displays at most two catalog labels', () => {
        expect(normalizeCatalogAudioSpecs(['high', 'lossless', 'hires', 'dolby', 'dts', 'dolby', 'DTS:X', 'VIP']))
            .toEqual(['hires', 'dolby', 'dts']);
        expect(getCatalogAudioLabels({ catalogAudioSpecs: ['hires', 'dolby', 'dts'] }, key => key)).toEqual(['catalogAudioSpecs.hires', 'catalogAudioSpecs.dolby']);
        expect(normalizeCatalogAudioSpecs({ hires: true })).toBeUndefined();
    });
    it('derives every label without any additional catalog or playback request', () => {
        const fetch = vi.fn(() => { throw Error('unexpected network access'); }); vi.stubGlobal('fetch', fetch);
        for (let index = 0; index < 397; index++) {
            const song = normalizeQqSong({ mid: String(index), file: { size_flac: 1000 } });
            expect(getCatalogAudioLabels(song, key => key)).toEqual(['catalogAudioSpecs.lossless']);
        }
        expect(fetch).not.toHaveBeenCalled();
    });
});

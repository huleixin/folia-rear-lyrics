import { normalizeCatalogAudioSpecs, type CatalogAudioSpec } from '../../types/catalogAudioSpecs';

// src/services/onlineMusic/catalogAudioSpecs.ts
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const positive = (value: unknown) => (typeof value === 'number' || typeof value === 'string') && Number.isFinite(Number(value)) && Number(value) > 0;
const presentHash = (value: unknown) => typeof value === 'string' && /^[a-f\d]{32}$/i.test(value) && !/^0+$/.test(value);
const fields = (raw: Record<string, any>, specs: CatalogAudioSpec[], authoritative: boolean) => {
    const catalogAudioSpecs = normalizeCatalogAudioSpecs(authoritative ? specs : raw.catalogAudioSpecs);
    return catalogAudioSpecs ? { catalogAudioSpecs } : {};
};

/** Read named QQ file-size fields; unknown size_new bit positions and VIP flags are not evidence. */
export function qqCatalogAudioFields(raw: unknown) {
    const item = record(raw), file = record(item.file), specs: CatalogAudioSpec[] = [];
    if (positive(file.size_hires)) specs.push('hires');
    else if (positive(file.size_flac) || positive(file.size_ape)) specs.push('lossless');
    else if (positive(file.size_320mp3)) specs.push('high');
    if (positive(file.size_dolby)) specs.push('dolby');
    if (positive(file.size_dts)) specs.push('dts');
    return fields(item, specs, ['size_hires', 'size_flac', 'size_ape', 'size_320mp3', 'size_dolby', 'size_dts'].some(key => key in file));
}

export function neteaseCatalogAudioFields(raw: unknown) {
    const item = record(raw), song = record(item.simpleSong || item), specs: CatalogAudioSpec[] = [];
    if (positive(record(song.hr).size)) specs.push('hires');
    else if (positive(record(song.sq).size)) specs.push('lossless');
    else {
        const high = record(song.h || song.hMusic);
        if (positive(high.size) && Number(high.br ?? high.bitrate) >= 320000) specs.push('high');
    }
    return fields({ catalogAudioSpecs: song.catalogAudioSpecs ?? item.catalogAudioSpecs }, specs, ['hr', 'sq', 'h', 'hMusic'].some(key => key in song));
}

/** Alternate HQ/SQ hashes are catalog entries, never a reason to fetch or decode every track. */
export function kugouCatalogAudioFields(raw: unknown) {
    const item = record(raw), audio = record(item.audio_info || item.audioInfo), specs: CatalogAudioSpec[] = [];
    if ([item.hashSq, item.sqhash, item.SQFileHash, item.hash_flac, item.hash_sq, audio.sqhash].some(presentHash)) specs.push('lossless');
    else if ([item.hash320, item['320hash'], item.HQFileHash, item.h320hash, item.hash_320, audio.hash_320].some(presentHash)) specs.push('high');
    return fields(item, specs, ['hashSq', 'sqhash', 'SQFileHash', 'hash_flac', 'hash_sq', 'hash320', '320hash', 'HQFileHash', 'h320hash', 'hash_320'].some(key => key in item)
        || ['sqhash', 'hash_320'].some(key => key in audio));
}

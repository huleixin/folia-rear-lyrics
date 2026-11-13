import { normalizeCatalogAccess, normalizeCatalogAudioSpecs, type CatalogAudioFields, type CatalogAudioSpec } from '../../types/catalogAudioSpecs';

// src/services/onlineMusic/catalogAudioSpecs.ts
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const integer = (value: unknown): number | undefined => {
    const parsed = typeof value === 'string' && /^\d{1,15}$/.test(value) ? Number(value) : value;
    return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
};
const positive = (value: unknown) => (integer(value) ?? 0) > 0;
const supplied = (raw: Record<string, any>, key: string) => Object.hasOwn(raw, key) && raw[key] !== undefined;
const presentHash = (value: unknown) => typeof value === 'string' && /^[a-f\d]{32}$/i.test(value) && !/^0+$/.test(value);
const fields = (raw: Record<string, any>, specs: CatalogAudioSpec[], authoritative: boolean): CatalogAudioFields => {
    const catalogAudioSpecs = normalizeCatalogAudioSpecs(authoritative ? specs : raw.catalogAudioSpecs);
    return catalogAudioSpecs ? { catalogAudioSpecs } : {};
};

// Named modern sizes: installed qq-music-api@3.3.1 protocol/qualityFile.js.
// Legacy aliases: https://github.com/Rain120/qq-music-api/issues/82 (size320/sizeflac),
// https://github.com/jsososo/QQMusicApi (sizeape). Never decode size_new / sa / switch.
/** Named QQ sizes and subscription permissions; pay_play does not distinguish purchase from VIP. */
export function qqCatalogAudioFields(raw: unknown): CatalogAudioFields {
    const item = record(raw), file = record(item.file), specs: CatalogAudioSpec[] = [];
    if (positive(file.size_hires)) specs.push('hires');
    else if (positive(file.size_flac ?? item.sizeflac) || positive(file.size_ape ?? item.sizeape)) specs.push('lossless');
    else if (positive(file.size_320mp3 ?? file.size_320 ?? item.size320)) specs.push('high');
    if (positive(file.size_dolby)) specs.push('dolby');
    if (positive(file.size_dts)) specs.push('dts');
    const result = fields(item, specs, supplied(item, 'file') || ['size320', 'sizeflac', 'sizeape'].some(key => supplied(item, key)));
    // Primary model documents pay_month=1 as a subscription/package permission.
    // https://github.com/l-1124/QQMusicApi/blob/main/qqmusic_api/models/base.py (Pay).
    // Prices, pay_down, pay_status and pay_play alone cannot prove a purchase requirement.
    const access = supplied(item, 'pay')
        ? (integer(record(item.pay).pay_month) === 1 ? 'vip' : undefined)
        : normalizeCatalogAccess(item.catalogAccess);
    return { ...result, ...(access ? { catalogAccess: access } : {}) };
}

// Installed NetEase API 4.41.1 public/docs/home.md: song-detail hr/sq/h and fee,
// song/url/v1 levels. Primary catalog model supplies je/sk/jm, NOT long object aliases:
// https://github.com/chaunsin/netease-cloud-music/blob/master/api/types/quality.go
// https://github.com/chaunsin/netease-cloud-music/blob/master/api/types/songs.go
export function neteaseCatalogAudioFields(raw: unknown): CatalogAudioFields {
    const item = record(raw), source = record(item.simpleSong || item);
    // An outer simpleSong envelope may carry privilege separately; variants stay under simpleSong.
    // A second simpleSong wrapper occurs in some queue/search envelopes.
    const nested = record(source.simpleSong);
    const song = Object.keys(nested).length ? nested : source;
    const specs: CatalogAudioSpec[] = [];
    const privilege = record(song.privilege ?? item.privilege);
    if (positive(record(song.jm).size)) specs.push('master');
    else if (positive(record(song.hr).size)) specs.push('hires');
    else if (positive(record(song.sq).size)) specs.push('lossless');
    else {
        const high = record(supplied(song, 'h') ? song.h : song.hMusic);
        if (positive(high.size) && (integer(high.br ?? high.bitrate) ?? 0) >= 320000) specs.push('high');
    }
    if (positive(record(song.je).size)) specs.push('jyeffect');
    if (positive(record(song.sk).size)) specs.push('sky');
    const named = ['jm', 'hr', 'sq', 'h', 'hMusic', 'je', 'sk'].some(key => supplied(song, key));
    // maxBrLevel is catalog maximum; plLevel/dlLevel and playMaxBrLevel are not substitutes.
    const levels: Record<string, CatalogAudioSpec> = { exhigh: 'high', lossless: 'lossless', hires: 'hires', jymaster: 'master', jyeffect: 'jyeffect', sky: 'sky', dolby: 'dolby' };
    const level = typeof privilege.maxBrLevel === 'string' && Object.hasOwn(levels, privilege.maxBrLevel) ? levels[privilege.maxBrLevel] : undefined;
    if (!named && level) specs.push(level);
    const result = fields({ catalogAudioSpecs: song.catalogAudioSpecs ?? item.catalogAudioSpecs }, specs, named || supplied(privilege, 'maxBrLevel'));
    // 8 includes free low-quality playback; the VIP category only describes premium access.
    // 1/8 may also be purchased individually, which does not turn them into purchase-only songs.
    const feeSource = supplied(song, 'fee') ? song : supplied(privilege, 'fee') ? privilege : item;
    const fee = integer(feeSource.fee);
    const access = supplied(feeSource, 'fee') ? (fee === 4 ? 'paid' : fee === 1 || fee === 8 ? 'vip' : undefined)
        : normalizeCatalogAccess(song.catalogAccess ?? item.catalogAccess);
    return { ...result, ...(access ? { catalogAccess: access } : {}) };
}

/** Alternate HQ/SQ hashes are catalog entries, never a reason to fetch or decode every track. */
export function kugouCatalogAudioFields(raw: unknown) {
    const item = record(raw), audio = record(item.audio_info || item.audioInfo), specs: CatalogAudioSpec[] = [];
    if ([item.hashSq, item.sqhash, item.SQFileHash, item.hash_flac, item.hash_sq, audio.sqhash].some(presentHash)) specs.push('lossless');
    else if ([item.hash320, item['320hash'], item.HQFileHash, item.h320hash, item.hash_320, audio.hash_320].some(presentHash)) specs.push('high');
    return fields(item, specs, ['hashSq', 'sqhash', 'SQFileHash', 'hash_flac', 'hash_sq', 'hash320', '320hash', 'HQFileHash', 'h320hash', 'hash_320'].some(key => key in item)
        || ['sqhash', 'hash_320'].some(key => key in audio));
}

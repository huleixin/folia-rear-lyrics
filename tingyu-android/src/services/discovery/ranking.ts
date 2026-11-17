import type { SongResult } from '../../types';
import type { DiscoverySettings } from '../../stores/useDiscoverySettingsStore';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { decayedPreference, type PreferenceMap } from './preferences';
import { sourceSongMap } from '../musicIdentity';

export type RadarKind = 'heart' | 'style' | 'explore' | 'time' | 'local' | 'niche';
export type RankedSong = { song: SongResult; score: number; reason: string };
export function stableHash(text: string) {
    let value = 2166136261; for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return (value >>> 0) / 4294967296;
}
/** Excluding one song must not reshuffle the rest: the same seed keeps their relative order. */
export function excludeSongs(songs: SongResult[], excluded: Iterable<string>) {
    const hidden = new Set(excluded);
    return songs.filter(song => !hidden.has(getPlaybackSongKey(song)));
}
export function rankDiscovery(songs: SongResult[], preferences: PreferenceMap, settings: DiscoverySettings,
    kind: RadarKind = 'heart', seed = '', now = Date.now(), limit = 30): RankedSong[] {
    const unique = sourceSongMap(songs);
    const artists = new Map<string, { sum: number; count: number }>();
    unique.forEach((song, key) => {
        const preference = preferences[key]; if (!preference) return;
        song.artists.forEach(artist => { const id = artist.name.trim().toLowerCase(); const prior = artists.get(id) ?? { sum: 0, count: 0 };
            artists.set(id, { sum: prior.sum + decayedPreference(preference, now), count: prior.count + 1 }); });
    });
    const ranked: RankedSong[] = [];
    unique.forEach((song, key) => {
        const preference = preferences[key], source = getPlaybackSourceRef(song);
        if (preference?.blocked || kind === 'local' && source.kind !== 'local' || kind === 'explore' && preference?.listens) return;
        if (kind === 'niche') return;
        let timeTier = 0;
        if (kind === 'time') {
            if (settings.source === 'local' && source.kind !== 'local') return;
            if (settings.source === 'all' && source.kind === 'online' && settings.enabled[source.providerId] === false) return;
            if (settings.source !== 'all' && settings.source !== 'local' && (source.kind !== 'online' || source.providerId !== settings.source)) return;
            const ageMs = preference?.lastPlayed ? now - preference.lastPlayed : -1;
            if (ageMs >= 30 * 86400_000) timeTier = 1;
            else if (ageMs >= 7 * 86400_000) timeTier = 2;
            else if (preference?.liked) timeTier = 3;
            else return;
        }
        const affinity = song.artists.reduce((max, artist) => { const stat = artists.get(artist.name.trim().toLowerCase());
            return Math.max(max, stat ? stat.sum / stat.count : 0); }, 0);
        const familiar = preference?.listens || preference?.liked;
        let score = decayedPreference(preference, now) * settings.familiarity + affinity * (1 - settings.crossArtist);
        if (!familiar) score += 8 * settings.exploration;
        if (kind === 'style') score = affinity * 2 + score * .3;
        if (kind === 'time') {
            const tierBase = timeTier === 1 ? 60 : timeTier === 2 ? 40 : 20;
            const ageBonus = preference?.lastPlayed ? Math.min(20, (now - preference.lastPlayed) / 86400_000) : 0;
            const listenBonus = preference?.listens ? Math.min(10, preference.listens) : 0;
            score += tierBase + ageBonus + listenBonus;
        }
        score += 4 * (source.kind === 'online' ? Math.max(0, Math.min(3, settings.weights[source.providerId] ?? 1)) : 1);
        score += stableHash(`${seed}:${key}`) * (2 + settings.exploration * 4);
        const reason = kind === 'time'
            ? (timeTier === 1 ? '曾经听过，近 30 天未再播放'
                : timeTier === 2 ? '曾经听过，近 7 天未再播放'
                : '你收藏过的旧爱歌曲')
            : preference?.liked ? '你收藏过这首歌' : affinity > 0 ? '与你听过的歌手有关'
            : familiar ? '根据你的收听记录' : source.kind === 'local' ? '来自你的本地曲库'
            : preference ? '来自已启用平台的真实推荐' : '来自已启用平台的每日或 FM 候选';
        ranked.push({ song, score, reason });
    });
    const selected: RankedSong[] = [], counts = new Map<string, number>();
    while (ranked.length && selected.length < limit) {
        const adjusted = (item: RankedSong) => item.score - (counts.get(item.song.artists[0]?.name ?? '') ?? 0) * (4 + settings.crossArtist * 8);
        ranked.sort((a,b) => adjusted(b) - adjusted(a) || getPlaybackSongKey(a.song).localeCompare(getPlaybackSongKey(b.song)));
        const item = ranked.shift()!; selected.push(item); const artist = item.song.artists[0]?.name ?? ''; counts.set(artist, (counts.get(artist) ?? 0) + 1);
    }
    return selected;
}

export type RoamingMode = 'balanced' | 'familiar' | 'explore';
/** 50/30/20 familiar, adjacent and new candidates; shortfalls are filled in the same order. */
export function mixRoaming(songs: SongResult[], preferences: PreferenceMap, mode: RoamingMode = 'balanced', seed = '', limit = 60) {
    const familiar: SongResult[] = [], adjacent: SongResult[] = [], fresh: SongResult[] = [];
    const knownArtists = new Set(Object.values(preferences).flatMap(value => value.artists ?? []));
    songs.forEach(song => {
        const preference = preferences[getPlaybackSongKey(song)];
        if (preference?.blocked) return;
        if (preference?.listens || preference?.liked) familiar.push(song);
        else if (song.artists.some(artist => knownArtists.has(artist.name.trim().toLowerCase()))) adjacent.push(song);
        else fresh.push(song);
    });
    const ratios = mode === 'familiar' ? [.75, .2, .05] : mode === 'explore' ? [.25, .25, .5] : [.5, .3, .2];
    const buckets = [familiar, adjacent, fresh].map(bucket => [...bucket].sort((a, b) =>
        stableHash(seed + getPlaybackSongKey(a)) - stableHash(seed + getPlaybackSongKey(b))));
    const result: SongResult[] = [];
    const seen = new Set<string>();
    const take = (bucket: SongResult[], count: number) => bucket.splice(0, count).forEach(song => {
        const key = getPlaybackSongKey(song); if (!seen.has(key)) { seen.add(key); result.push(song); }
    });
    [0, 1, 2].forEach(index => take(buckets[index], Math.round(limit * ratios[index])));
    while (result.length < limit) {
        const before = result.length;
        buckets.forEach(bucket => take(bucket, 1));
        if (result.length === before) break;
    }
    return result.slice(0, limit);
}

export interface TimeRadarDiagnostics {
    rawHistoryCount: number;
    tier1Count: number;
    tier2Count: number;
    tier3Count: number;
    platformFilteredCount: number;
    dedupedCount: number;
    missingFieldsCount: number;
    unavailableCount: number;
    finalCount: number;
    emptyReason: string;
}

export function diagnoseTimeRadar(
    songs: SongResult[],
    preferences: PreferenceMap,
    settings: DiscoverySettings,
    now = Date.now(),
    limit = 30,
): TimeRadarDiagnostics {
    const rawHistoryCount = Object.keys(preferences).length;
    let tier1Count = 0, tier2Count = 0, tier3Count = 0;
    let platformFilteredCount = 0, missingFieldsCount = 0, unavailableCount = 0;
    const seen = new Set<string>();
    for (const song of songs) {
        const key = getPlaybackSongKey(song);
        if (!key || !song.name) { missingFieldsCount++; continue; }
        if (seen.has(key)) continue;
        seen.add(key);
        const pref = preferences[key];
        if (pref?.blocked) { unavailableCount++; continue; }
        const src = getPlaybackSourceRef(song);
        const inScope = settings.source === 'all'
            ? (src.kind !== 'online' || settings.enabled[src.providerId] !== false)
            : settings.source === 'local'
                ? src.kind === 'local'
                : (src.kind === 'online' && src.providerId === settings.source);
        if (!inScope) { platformFilteredCount++; continue; }
        const ageMs = pref?.lastPlayed ? now - pref.lastPlayed : -1;
        if (ageMs >= 30 * 86400_000) tier1Count++;
        else if (ageMs >= 7 * 86400_000) tier2Count++;
        else if (pref?.liked) tier3Count++;
    }
    const finalCount = Math.min(limit, tier1Count + tier2Count + tier3Count);
    const emptyReason = finalCount > 0 ? ''
        : rawHistoryCount === 0 ? 'no-history'
        : (tier1Count + tier2Count + tier3Count === 0) ? 'insufficient-age-or-likes'
        : 'filtered';
    return {
        rawHistoryCount, tier1Count, tier2Count, tier3Count,
        platformFilteredCount, dedupedCount: seen.size, missingFieldsCount, unavailableCount, finalCount, emptyReason,
    };
}

import type { SongResult } from '../../types';
import type { DiscoverySettings } from '../../stores/useDiscoverySettingsStore';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { decayedPreference, type PreferenceMap } from './preferences';
import { sourceSongMap } from '../musicIdentity';

export type RadarKind = 'heart' | 'style' | 'explore' | 'time' | 'local' | 'niche';
export type RankedSong = { song: SongResult; score: number; reason: string };
export interface TimeRadarContext {
    likedKeys?: ReadonlySet<string>;
    sessionStats?: ReadonlyMap<string, { lastPlayed: number; plays: number }>;
    preferencesReady?: boolean;
    nativeIdentityFailCount?: number;
    platformLikedCounts?: Record<string, number>;
}
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
    kind: RadarKind = 'heart', seed = '', now = Date.now(), limit = 30, timeContext?: TimeRadarContext): RankedSong[] {
    if (kind === 'time') {
        return evaluateTimeRadar(songs, preferences, settings, seed, now, limit, timeContext).selected;
    }
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
        const affinity = song.artists.reduce((max, artist) => { const stat = artists.get(artist.name.trim().toLowerCase());
            return Math.max(max, stat ? stat.sum / stat.count : 0); }, 0);
        const familiar = preference?.listens || preference?.liked;
        let score = decayedPreference(preference, now) * settings.familiarity + affinity * (1 - settings.crossArtist);
        if (!familiar) score += 8 * settings.exploration;
        if (kind === 'style') score = affinity * 2 + score * .3;
        score += 4 * (source.kind === 'online' ? Math.max(0, Math.min(3, settings.weights[source.providerId] ?? 1)) : 1);
        score += stableHash(`${seed}:${key}`) * (2 + settings.exploration * 4);
        const reason = preference?.liked ? '你收藏过这首歌' : affinity > 0 ? '与你听过的歌手有关'
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
    recordingEnabled: boolean;
    preferencesReady: boolean;
    validSessionCount: number;
    distinctHistorySongCount: number;
    platformLikedCounts: Record<string, number>;
    nativeIdentityFailCount: number;
    tierCounts: { s1: number; s2: number; s3: number; s4: number; s5: number };
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

const TIME_RADAR_REASONS: Record<1 | 2 | 3 | 4 | 5, string> = {
    1: '30 天以上未再播放的旧日旋律',
    2: '7 天以上未再播放的熟悉歌曲',
    3: '曾经常听，近 3 天未再播放',
    4: '你收藏过且近期未常播的音乐',
    5: '近期反复收听、值得回味',
};

function evaluateTimeRadar(
    songs: SongResult[],
    preferences: PreferenceMap,
    settings: DiscoverySettings,
    seed = '',
    now = Date.now(),
    limit = 30,
    context?: TimeRadarContext,
): { selected: RankedSong[]; diagnostics: TimeRadarDiagnostics } {
    const rawHistoryCount = Object.keys(preferences).length;
    const tierCounts = { s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 };
    let platformFilteredCount = 0, missingFieldsCount = 0, unavailableCount = 0;
    const seen = new Set<string>();
    const byTier: Record<1 | 2 | 3 | 4 | 5, RankedSong[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };

    for (const song of songs) {
        const key = getPlaybackSongKey(song);
        if (!key || !song.name) { missingFieldsCount++; continue; }
        if (seen.has(key)) continue;
        seen.add(key);

        const pref = preferences[key];
        if (pref?.blocked) { unavailableCount++; continue; }

        const source = getPlaybackSourceRef(song);
        const inScope = settings.source === 'local'
            ? source.kind === 'local'
            : settings.source === 'all'
                ? (source.kind === 'local' ? settings.includeLocal : source.kind !== 'online' || settings.enabled[source.providerId] !== false)
                : (source.kind === 'online' && source.providerId === settings.source);
        if (!inScope) { platformFilteredCount++; continue; }

        const sessionStat = context?.sessionStats?.get(key);
        const lastPlayed = Math.max(pref?.lastPlayed || 0, sessionStat?.lastPlayed || 0);
        const listens = Math.max(pref?.listens || 0, sessionStat?.plays || 0);
        const liked = Boolean(pref?.liked || context?.likedKeys?.has(key));
        const ageMs = lastPlayed > 0 ? Math.max(0, now - lastPlayed) : -1;

        let tier: 1 | 2 | 3 | 4 | 5 | 0 = 0;
        if (ageMs >= 30 * 86400_000) tier = 1;
        else if (ageMs >= 7 * 86400_000) tier = 2;
        else if (ageMs >= 3 * 86400_000 && listens >= 2) tier = 3;
        else if (liked && (lastPlayed === 0 || ageMs >= 86400_000)) tier = 4;
        else if (listens >= 2 || (liked && listens >= 1)) tier = 5;
        if (!tier) continue;

        if (tier === 1) tierCounts.s1++;
        else if (tier === 2) tierCounts.s2++;
        else if (tier === 3) tierCounts.s3++;
        else if (tier === 4) tierCounts.s4++;
        else tierCounts.s5++;

        const ageDays = lastPlayed > 0 ? Math.min(30, Math.max(0, (now - lastPlayed) / 86400_000)) : 0;
        const weight = source.kind === 'online' ? Math.max(0, Math.min(3, settings.weights[source.providerId] ?? 1)) : 1;
        const score = (6 - tier) * 100
            + decayedPreference(pref, now) * settings.familiarity
            + ageDays * 2
            + Math.min(15, listens * 2)
            + weight * 4
            + stableHash(`${seed}:${key}`) * (2 + settings.exploration * 4);
        byTier[tier].push({ song, score, reason: TIME_RADAR_REASONS[tier] });
    }

    const selected: RankedSong[] = [];
    const artistCounts = new Map<string, number>();
    for (const tier of [1, 2, 3, 4, 5] as const) {
        const pool = byTier[tier];
        while (pool.length && selected.length < limit) {
            const adjusted = (item: RankedSong) =>
                item.score - (artistCounts.get(item.song.artists[0]?.name ?? '') ?? 0) * (4 + settings.crossArtist * 8);
            pool.sort((a, b) => adjusted(b) - adjusted(a) || getPlaybackSongKey(a.song).localeCompare(getPlaybackSongKey(b.song)));
            const picked = pool.shift()!;
            selected.push(picked);
            const artist = picked.song.artists[0]?.name ?? '';
            artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1);
        }
        if (selected.length >= limit) break;
    }

    const totalSessions = context?.sessionStats
        ? [...context.sessionStats.values()].reduce((sum, s) => sum + s.plays, 0)
        : Object.values(preferences).reduce((sum, p) => sum + (p.listens || 0), 0);
    const distinctHistorySongCount = new Set([
        ...Object.keys(preferences),
        ...(context?.sessionStats ? context.sessionStats.keys() : []),
    ]).size;
    const totalEligible = tierCounts.s1 + tierCounts.s2 + tierCounts.s3 + tierCounts.s4 + tierCounts.s5;
    const emptyReason = selected.length > 0 ? ''
        : !settings.record && totalEligible === 0 && (context?.likedKeys?.size ?? 0) === 0 ? 'recording-disabled'
        : distinctHistorySongCount === 0 && (context?.likedKeys?.size ?? 0) === 0 ? 'no-history-or-likes'
        : totalEligible === 0 ? 'insufficient-history-or-filtered'
        : 'filtered';

    return {
        selected,
        diagnostics: {
            recordingEnabled: settings.record,
            preferencesReady: context?.preferencesReady ?? true,
            validSessionCount: totalSessions,
            distinctHistorySongCount,
            platformLikedCounts: context?.platformLikedCounts ?? {},
            nativeIdentityFailCount: context?.nativeIdentityFailCount ?? 0,
            tierCounts,
            rawHistoryCount,
            tier1Count: tierCounts.s1,
            tier2Count: tierCounts.s2,
            tier3Count: tierCounts.s3 + tierCounts.s4 + tierCounts.s5,
            platformFilteredCount,
            dedupedCount: seen.size,
            missingFieldsCount,
            unavailableCount,
            finalCount: selected.length,
            emptyReason,
        },
    };
}

export function diagnoseTimeRadar(
    songs: SongResult[],
    preferences: PreferenceMap,
    settings: DiscoverySettings,
    now = Date.now(),
    limit = 30,
    context?: TimeRadarContext,
): TimeRadarDiagnostics {
    return evaluateTimeRadar(songs, preferences, settings, '', now, limit, context).diagnostics;
}

let latestTimeRadarDiagnostics: TimeRadarDiagnostics | null = null;
export function setLatestTimeRadarDiagnostics(value: TimeRadarDiagnostics | null): void {
    latestTimeRadarDiagnostics = value;
}
export function getLatestTimeRadarDiagnostics(): TimeRadarDiagnostics | null {
    return latestTimeRadarDiagnostics;
}
export function formatTimeRadarDiagnosticLines(): string[] {
    const diag = latestTimeRadarDiagnostics;
    if (!diag) return ['', 'time radar:', '  (not evaluated yet)'];
    const likedSummary = Object.entries(diag.platformLikedCounts)
        .map(([k, v]) => `${k}=${v}`).join(', ') || 'none';
    return [
        '',
        'time radar:',
        `  recordingEnabled: ${diag.recordingEnabled}`,
        `  preferencesReady: ${diag.preferencesReady}`,
        `  validSessionCount: ${diag.validSessionCount}`,
        `  distinctHistorySongCount: ${diag.distinctHistorySongCount}`,
        `  platformLikedCounts: ${likedSummary}`,
        `  nativeIdentityFailCount: ${diag.nativeIdentityFailCount}`,
        `  tierCounts: s1=${diag.tierCounts.s1} s2=${diag.tierCounts.s2} s3=${diag.tierCounts.s3} s4=${diag.tierCounts.s4} s5=${diag.tierCounts.s5}`,
        `  platformFilteredCount: ${diag.platformFilteredCount}`,
        `  dedupedCount: ${diag.dedupedCount}`,
        `  missingFieldsCount: ${diag.missingFieldsCount}`,
        `  unavailableCount: ${diag.unavailableCount}`,
        `  finalCount: ${diag.finalCount}`,
        `  emptyReason: ${diag.emptyReason || '(none)'}`,
    ];
}

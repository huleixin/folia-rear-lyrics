import type { SongResult } from '../../../types';
import type { ListeningSessionRecord } from '../../../types/listeningStatistics';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../../../utils/appPlaybackGuards';

// src/library/core/model/smartPlaylists.ts
export type SmartField = 'source' | 'artist' | 'album' | 'name' | 'liked' | 'plays' | 'seconds'
    | 'lastPlayed' | 'addedAt' | 'quality' | 'duration' | 'folder' | 'tag';
export type SmartCondition = { field: SmartField; op: 'contains' | 'is' | 'gte' | 'lte'; value: string | number | boolean };
export type SmartRule = {
    id: string; name: string; match: 'all' | 'any'; conditions: SmartCondition[];
    sort: 'name' | 'plays' | 'seconds' | 'lastPlayed' | 'addedAt'; limit: number;
    periodDays?: number; night?: { from: number; to: number }; year?: number;
};
export interface SmartCandidate {
    song: SongResult; liked?: boolean; addedAt?: number; folder?: string; tags?: string[];
    /** Legacy history proves a previous play, but never proves effective duration. */
    legacyLastPlayed?: number;
}
export interface SmartFacts extends SmartCandidate { plays: number; seconds: number; lastPlayed: number }
const DAY = 86_400_000;
const sourceId = (song: SongResult) => {
    const source = getPlaybackSourceRef(song); return source.kind === 'online' ? source.providerId : source.kind;
};
function fieldValue(facts: SmartFacts, field: SmartField): string | string[] | number | boolean | undefined {
    const { song } = facts;
    switch (field) {
        case 'source': return sourceId(song);
        case 'artist': return song.artists.map(artist => artist.name);
        case 'album': return song.album?.name;
        case 'name': return song.name;
        case 'liked': return facts.liked;
        case 'plays': return facts.plays;
        case 'seconds': return facts.seconds;
        case 'lastPlayed': return facts.lastPlayed || undefined;
        case 'addedAt': return facts.addedAt;
        case 'quality': return song.catalogAudioSpecs ? [...song.catalogAudioSpecs] : undefined;
        case 'duration': return song.durationMs > 0 ? song.durationMs / 1000 : undefined;
        case 'folder': return facts.folder;
        case 'tag': return facts.tags;
    }
}
function matches(facts: SmartFacts, condition: SmartCondition): boolean {
    const actual = fieldValue(facts, condition.field);
    if (actual === undefined) return false;
    if (condition.op === 'gte' || condition.op === 'lte') {
        return typeof actual === 'number' && typeof condition.value === 'number' && Number.isFinite(condition.value)
            && (condition.op === 'gte' ? actual >= condition.value : actual <= condition.value);
    }
    const normalize = (value: unknown) => String(value).normalize('NFKC').trim().toLocaleLowerCase();
    const expected = normalize(condition.value);
    return (Array.isArray(actual) ? actual : [actual]).some(value => condition.op === 'contains'
        ? normalize(value).includes(expected) : normalize(value) === expected);
}

/** Build once per data revision; no audio progress subscriptions or guessed metadata. */
export function smartFacts(candidates: readonly SmartCandidate[], sessions: readonly ListeningSessionRecord[],
    rule: SmartRule, now = Date.now()): SmartFacts[] {
    const facts = new Map<string, SmartFacts>();
    candidates.forEach(candidate => {
        const key = getPlaybackSongKey(candidate.song);
        if (!facts.has(key)) facts.set(key, { ...candidate, plays: 0, seconds: 0, lastPlayed: candidate.legacyLastPlayed || 0 });
    });
    const seen = new Set<string>();
    for (const session of sessions) {
        if (seen.has(session.id)) continue;
        seen.add(session.id);
        const fact = facts.get(session.songKey);
        if (!fact) continue;
        fact.lastPlayed = Math.max(fact.lastPlayed, session.startedAt);
        const date = new Date(session.startedAt), hour = date.getHours();
        if (rule.periodDays && session.startedAt < now - rule.periodDays * DAY) continue;
        if (rule.year && date.getFullYear() !== rule.year) continue;
        if (rule.night && !(rule.night.from < rule.night.to ? hour >= rule.night.from && hour < rule.night.to
            : hour >= rule.night.from || hour < rule.night.to)) continue;
        fact.plays++; fact.seconds += session.seconds;
    }
    return [...facts.values()];
}

export function evaluateSmartPlaylist(candidates: readonly SmartCandidate[], sessions: readonly ListeningSessionRecord[],
    rule: SmartRule, now = Date.now()): SmartFacts[] {
    return selectSmartFacts(smartFacts(candidates, sessions, rule, now), rule);
}

/** Share statistics between rules with the same time window within one data revision. */
export function evaluateSmartPlaylists(candidates: readonly SmartCandidate[], sessions: readonly ListeningSessionRecord[],
    rules: readonly SmartRule[], now = Date.now()): Array<{ rule: SmartRule; songs: SmartFacts[] }> {
    const windows = new Map<string, SmartFacts[]>();
    return rules.map(rule => {
        const key = JSON.stringify([rule.periodDays || null, rule.year || null, rule.night || null]);
        let facts = windows.get(key);
        if (!facts) { facts = smartFacts(candidates, sessions, rule, now); windows.set(key, facts); }
        return { rule, songs: selectSmartFacts(facts, rule) };
    });
}

function selectSmartFacts(input: readonly SmartFacts[], rule: SmartRule): SmartFacts[] {
    const facts = input.filter(fact => {
        if (rule.id === 'unheard' && fact.lastPlayed > 0) return false;
        if (rule.periodDays || rule.night || rule.year) { if (!fact.plays) return false; }
        return rule.match === 'any' ? rule.conditions.some(condition => matches(fact, condition))
            : rule.conditions.every(condition => matches(fact, condition));
    });
    facts.sort((a,b) => (rule.sort === 'name' ? a.song.name.localeCompare(b.song.name)
        : (b[rule.sort] || 0) - (a[rule.sort] || 0)) || getPlaybackSongKey(a.song).localeCompare(getPlaybackSongKey(b.song)));
    return facts.slice(0, Math.min(1000, Math.max(1, Math.floor(rule.limit) || 30)));
}

export function defaultSmartRules(now = Date.now()): SmartRule[] {
    const base = { match: 'all' as const, limit: 30, conditions: [] as SmartCondition[], sort: 'plays' as const };
    return [
        { ...base, id: 'week', name: '最近常听 · 7天', periodDays: 7 },
        { ...base, id: 'month', name: '最近常听 · 30天', periodDays: 30 },
        { ...base, id: 'forgotten', name: '很久没听', sort: 'lastPlayed', conditions: [
            { field: 'lastPlayed', op: 'gte', value: 1 }, { field: 'lastPlayed', op: 'lte', value: now - 30 * DAY }] },
        { ...base, id: 'added', name: '最近添加', sort: 'addedAt', conditions: [{ field: 'addedAt', op: 'gte', value: 1 }] },
        { ...base, id: 'unheard', name: '收藏未听', conditions: [{ field: 'liked', op: 'is', value: true }] },
        { ...base, id: 'quality', name: '高品质音乐', match: 'any', conditions: ['lossless','hires','master','dolby','dts'].map(value => ({ field: 'quality', op: 'is', value })) },
        { ...base, id: 'night', name: '深夜常听', night: { from: 22, to: 6 } },
        { ...base, id: 'year', name: '我的年度常听', year: new Date(now).getFullYear() },
    ];
}

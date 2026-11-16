import { create } from 'zustand';
import { appDatabase } from '../appDatabase';
import type { SongResult } from '../../types';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import { useDiscoverySettingsStore } from '../../stores/useDiscoverySettingsStore';

export type Preference = { score: number; lastPlayed: number; listens: number; liked: boolean; blocked: boolean;
    day: string; earned: number; updated: number; artists?: string[] };
export type PreferenceMap = Record<string, Preference>;
const KEY = 'tingyu_discovery_preferences_v1';
export const useDiscoveryPreferences = create<{ values: PreferenceMap; revision: number; ready: boolean }>(() => ({ values: {}, revision: 0, ready: false }));
let revision = 0;
let writes: Promise<unknown> = Promise.resolve();
let hydration: Promise<void> | undefined;
const sessions = new Set<string>();
export function hydratePreferences() {
    return hydration ??= appDatabase.session.get(KEY).then(saved => {
        const value = saved as { values?: PreferenceMap; revision?: number } | undefined;
        if (!revision) useDiscoveryPreferences.setState({ values: value?.values ?? {}, revision: value?.revision ?? 0 });
    }).catch(() => {}).finally(() => useDiscoveryPreferences.setState({ ready: true }));
}
export function decayedPreference(value: Preference | undefined, now: number) {
    return value ? value.score * Math.pow(.5, Math.max(0, now - value.updated) / (30 * 86400_000)) + (value.liked ? 10 : 0) : 0;
}
function persist(values: PreferenceMap) {
    revision++;
    const next = useDiscoveryPreferences.getState().revision + 1;
    useDiscoveryPreferences.setState({ values, revision: next });
    // Serialize settlements so a slow old write cannot restore cleared preferences. No clock writes.
    writes = writes.catch(() => {}).then(() => appDatabase.session.put({ values, revision: next }, KEY)).catch(() => {});
}
export function clearDiscoveryPreferences() { sessions.clear(); persist({}); }
export function recordDiscoveryFeedback(song: SongResult, event: 'like' | 'unlike' | 'dislike' | 'search' | 'playlist' | 'listen',
    detail: { session?: string; seconds?: number; completed?: boolean; now?: number } = {}) {
    if (!useDiscoverySettingsStore.getState().record || !useDiscoveryPreferences.getState().ready) return;
    if (detail.session && sessions.has(detail.session)) return;
    if (detail.session) { sessions.add(detail.session); if (sessions.size > 1000) sessions.delete(sessions.values().next().value!); }
    const now = detail.now ?? Date.now(), day = new Date(now).toLocaleDateString('sv-SE');
    const values = useDiscoveryPreferences.getState().values, key = getPlaybackSongKey(song);
    const previous = values[key] ?? { score: 0, lastPlayed: 0, listens: 0, liked: false, blocked: false, day, earned: 0, updated: now,
        artists: song.artists.map(artist => artist.name.trim().toLowerCase()) };
    const value = { ...previous, score: decayedPreference(previous, now) - (previous.liked ? 10 : 0), updated: now, day, earned: previous.day === day ? previous.earned : 0 };
    if (event === 'like' || event === 'unlike') value.liked = event === 'like';
    if (event === 'dislike') { value.blocked = true; value.score = Math.max(-30, value.score - 15); }
    let delta = event === 'search' ? 5 : event === 'playlist' ? 6 : 0;
    if (event === 'listen') {
        const ratio = song.durationMs > 0 ? (detail.seconds ?? 0) * 1000 / song.durationMs : 0;
        delta = detail.completed && ratio >= .9 ? 4 : ratio >= .5 ? 2 : 0;
        if ((detail.seconds ?? 0) >= 30) {
            if (value.listens > 0) delta += 3;
            value.listens++; value.lastPlayed = now;
        }
    }
    const earned = Math.min(delta, Math.max(0, 12 - value.earned));
    value.score = Math.min(40, value.score + earned); value.earned += earned;
    const next = { ...values, [key]: value };
    const keys = Object.keys(next);
    if (keys.length > 5000) keys.sort((a,b) => next[a].updated - next[b].updated).slice(0, keys.length - 5000).forEach(id => delete next[id]);
    persist(next);
}

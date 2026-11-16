import { appDatabase } from './appDatabase';
import type { ListeningSessionRecord } from '../types/listeningStatistics';

// src/services/listeningStatistics.ts
export const LISTENING_STATISTICS_CHANGED = 'tingyu-listening-statistics-changed';
export const LISTENING_STATISTICS_CLEARED = 'tingyu-listening-statistics-cleared';
let writes: Promise<unknown> = Promise.resolve();
let revision = 0;
let clearGeneration = 0;
const notify = () => {
    revision++;
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(LISTENING_STATISTICS_CHANGED));
};
export const listeningStatisticsRevision = () => revision;

/** A primary-key upsert settles one session once even if a lifecycle callback is repeated. */
export function storeListeningSession(record: ListeningSessionRecord): Promise<void> {
    if (!Number.isFinite(record.seconds) || record.seconds < 30 || record.endedAt < record.startedAt) return Promise.resolve();
    const generation = clearGeneration;
    const write = writes.catch(() => {}).then(async () => {
        if (generation !== clearGeneration) return;
        await appDatabase.listening_sessions.put(record);
        notify();
    });
    writes = write.catch(() => {});
    return write.catch(() => {}); // Statistics storage failures must not interrupt playback.
}

export async function clearListeningStatistics(): Promise<void> {
    clearGeneration++;
    const write = writes.catch(() => {}).then(async () => {
        await appDatabase.listening_sessions.clear();
        if (typeof window !== 'undefined') window.dispatchEvent(new Event(LISTENING_STATISTICS_CLEARED));
        notify();
    });
    writes = write.catch(() => {});
    await write;
}

export async function readListeningSessions(from: number, to: number): Promise<ListeningSessionRecord[]> {
    await writes;
    return appDatabase.listening_sessions.where('startedAt').between(from, to, true, false).toArray();
}

export interface ListeningSummary {
    plays: number; seconds: number; songs: number; artists: number; albums: number;
    firstRecordedAt: number | null;
    providers: Array<{ id: string; seconds: number; plays: number }>;
    daily: Array<{ day: string; seconds: number; plays: number }>;
    hourly: number[];
    topSongs: Array<{ song: ListeningSessionRecord['song']; seconds: number; plays: number }>;
    topArtists: Array<{ name: string; seconds: number; plays: number }>;
    topAlbums: Array<{ name: string; seconds: number; plays: number }>;
}

/** Each session belongs to its actual start date; paused/buffering time was excluded upstream. */
export function summarizeListening(records: readonly ListeningSessionRecord[]): ListeningSummary {
    const songs = new Map<string, { song: ListeningSessionRecord['song']; seconds: number; plays: number }>();
    const providers = new Map<string, { id: string; seconds: number; plays: number }>();
    const daily = new Map<string, { day: string; seconds: number; plays: number }>();
    const artists = new Map<string, { name: string; seconds: number; plays: number }>();
    const albums = new Map<string, { name: string; seconds: number; plays: number }>();
    const hourly = Array<number>(24).fill(0), seen = new Set<string>();
    let seconds = 0, firstRecordedAt: number | null = null;
    for (const record of records) {
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        seconds += record.seconds;
        firstRecordedAt = Math.min(firstRecordedAt ?? record.startedAt, record.startedAt);
        const date = new Date(record.startedAt), day = date.toLocaleDateString('sv-SE');
        hourly[date.getHours()] += record.seconds;
        const song = songs.get(record.songKey) ?? { song: record.song, seconds: 0, plays: 0 };
        song.seconds += record.seconds; song.plays++; songs.set(record.songKey, song);
        const provider = providers.get(record.providerId) ?? { id: record.providerId, seconds: 0, plays: 0 };
        provider.seconds += record.seconds; provider.plays++; providers.set(record.providerId, provider);
        const dateEntry = daily.get(day) ?? { day, seconds: 0, plays: 0 };
        dateEntry.seconds += record.seconds; dateEntry.plays++; daily.set(day, dateEntry);
        for (const artist of record.song.artists) {
            const key = record.providerId + ':' + artist.id + ':' + artist.name;
            const entry = artists.get(key) ?? { name: artist.name, seconds: 0, plays: 0 };
            entry.seconds += record.seconds; entry.plays++; artists.set(key, entry);
        }
        if (record.song.album?.name) {
            const key = record.providerId + ':' + record.song.album.id + ':' + record.song.album.name;
            const entry = albums.get(key) ?? { name: record.song.album.name, seconds: 0, plays: 0 };
            entry.seconds += record.seconds; entry.plays++; albums.set(key, entry);
        }
    }
    const byTime = <T extends { seconds: number }>(items: T[]) => items.sort((a,b) => b.seconds - a.seconds);
    return { plays: seen.size, seconds, songs: songs.size, artists: artists.size, albums: albums.size,
        firstRecordedAt, providers: byTime([...providers.values()]), daily: [...daily.values()].sort((a,b) => a.day.localeCompare(b.day)),
        hourly, topSongs: byTime([...songs.values()]), topArtists: byTime([...artists.values()]), topAlbums: byTime([...albums.values()]) };
}

import type { LibraryHomeFeedOwner } from '../contracts/homeModel';

// src/library/core/services/homeFeedSnapshotCache.ts
// Small account-scoped presentation snapshots; no credentials or playback URLs are stored.
const PREFIX = 'folia:home-feed:v1:';
export const HOME_FEED_FRESH_MS = 5 * 60_000;
export type HomeFeedCacheEntry<T> = { data: T; savedAt: number; complete: boolean };
const memory = new Map<string, HomeFeedCacheEntry<unknown>>();
const keyOf = (name: string, owner: LibraryHomeFeedOwner) => PREFIX + JSON.stringify([name, owner.providerId, String(owner.userId)]);
export function readHomeFeedSnapshot<T>(name: string, owner: LibraryHomeFeedOwner): HomeFeedCacheEntry<T> | null {
    const key = keyOf(name, owner);
    const cached = memory.get(key);
    if (cached && Date.now() - cached.savedAt >= 0 && Date.now() - cached.savedAt <= 7 * 86400_000) return cached as HomeFeedCacheEntry<T>;
    if (cached) memory.delete(key);
    try {
        const raw = globalThis.localStorage?.getItem(key);
        if (!raw || raw.length > 200_000) return null;
        const entry = JSON.parse(raw);
        if (!entry || typeof entry.savedAt !== 'number' || typeof entry.complete !== 'boolean' || !('data' in entry)) return null;
        if (Date.now() - entry.savedAt < 0 || Date.now() - entry.savedAt > 7 * 86400_000) return null;
        memory.set(key, entry);
        return entry;
    } catch { return null; }
}
export function writeHomeFeedSnapshot<T>(name: string, owner: LibraryHomeFeedOwner, data: T, complete: boolean): void {
    const key = keyOf(name, owner);
    const entry = { data, complete, savedAt: Date.now() };
    memory.delete(key);
    memory.set(key, entry);
    while (memory.size > 8) memory.delete(memory.keys().next().value!);
    try {
        const raw = JSON.stringify(entry);
        if (raw.length > 200_000) return;
        globalThis.localStorage?.setItem(key, raw);
        const keys = Object.keys(globalThis.localStorage).filter(k => k.startsWith(PREFIX));
        if (keys.length > 8) keys.sort((a, b) => {
            try { return JSON.parse(localStorage.getItem(a)!).savedAt - JSON.parse(localStorage.getItem(b)!).savedAt; }
            catch { return 0; }
        }).slice(0, keys.length - 8).forEach(k => localStorage.removeItem(k));
    } catch { /* A full or unavailable cache must not interrupt listening. */ }
}

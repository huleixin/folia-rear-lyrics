import type { SongResult } from '../types';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../utils/appPlaybackGuards';
import { getProviderSongMetadata } from './onlineMusic/songMetadata';

// src/services/musicIdentity.ts
export const normalizeMusicName = (value: string) => value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
export const sourceSongMap = <T extends SongResult>(songs: readonly T[]) => new Map(songs.map(song => [getPlaybackSongKey(song), song]));
export type SongIdentityGroup<T extends SongResult> = { key: string; sources: T[]; evidence: 'source' | 'catalog' | 'metadata' };
function catalogIdentity(song: SongResult): string | null {
    const ref = getPlaybackSourceRef(song);
    if (ref.kind !== 'online') return null;
    // Only native catalog carriers qualify. Lyric-match IDs on another source are not recording evidence.
    if (ref.providerId === 'qq' && song.qqMid) return 'qq:' + song.qqMid;
    if (ref.providerId === 'kugou' && song.kgHash && /^[a-f0-9]{32}$/i.test(song.kgHash)) return 'kg:' + song.kgHash.toLowerCase();
    return null;
}
function metadataIdentity(song: SongResult, data: ReturnType<typeof getProviderSongMetadata>): string | null {
    const title = normalizeMusicName(song.name), album = normalizeMusicName(data.album.name);
    const artists = data.artists.map(artist => normalizeMusicName(artist.name)).filter(Boolean).sort();
    const unknown = /^(unknown(?: artist| album)?|未知(?:歌手|专辑)?|群星|various artists)$/;
    if (!title || !album || unknown.test(album) || !artists.length || artists.some(name => unknown.test(name))
        || !Number.isFinite(data.durationMs) || !(data.durationMs > 0)) return null;
    // Retain version words from title, album and aliases instead of stripping Live/remaster/instrumental markers.
    const versions = [song.name, data.album.name, ...data.aliases].join(' ').toLowerCase()
        .match(/\b(?:live|remaster(?:ed)?|remix|instrumental|acoustic|cover)\b|伴奏|现场|翻唱|重制|重录|不插电|录音室/g) ?? [];
    return JSON.stringify([title, artists, album, [...new Set(versions)].sort()]);
}
/** Conservative grouping keeps every source carrier. Missing metadata and distinct versions remain separate. */
export function groupMusicSources<T extends SongResult>(songs: readonly T[]): SongIdentityGroup<T>[] {
    const result: SongIdentityGroup<T>[] = [], buckets = new Map<string, SongIdentityGroup<T>[]>(), catalogGroups = new Map<string, SongIdentityGroup<T>>();
    const facts = new Map<T, { source: string; metadata: string | null; duration: number }>();
    for (const song of sourceSongMap(songs).values()) {
        const ref = getPlaybackSourceRef(song), data = getProviderSongMetadata(song);
        const sourceKey = getPlaybackSongKey(song), catalog = catalogIdentity(song), metadata = ref.kind === 'stage' ? null : metadataIdentity(song, data);
        const source = ref.kind === 'online' ? ref.providerId : ref.kind;
        facts.set(song, { source, metadata, duration: data.durationMs });
        const bucketKey = metadata;
        const candidates = bucketKey ? buckets.get(bucketKey) ?? [] : [];
        // Compare to every member to prevent transitive duration drift. Metadata evidence requires different sources.
        const catalogGroup = catalog ? catalogGroups.get(catalog) : undefined;
        const group = catalogGroup ?? candidates.find(item => item.sources.every(other => {
            const fact = facts.get(other)!;
            return fact.metadata === metadata && fact.source !== source && Math.abs(fact.duration - data.durationMs) <= 1000;
        }));
        if (group) { group.sources.push(song); if (!catalogGroup) group.evidence = 'metadata'; else if (group.evidence !== 'metadata') group.evidence = 'catalog'; }
        else { const item: SongIdentityGroup<T> = { key: sourceKey, sources: [song], evidence: 'source' }; result.push(item);
            if (bucketKey) buckets.set(bucketKey, [...candidates, item]); }
        if (catalog) catalogGroups.set(catalog, group ?? result[result.length - 1]);
    }
    return result;
}

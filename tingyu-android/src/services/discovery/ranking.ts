import type { SongResult } from '../../types';
import type { DiscoverySettings } from '../../stores/useDiscoverySettingsStore';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { decayedPreference, type PreferenceMap } from './preferences';

export type RadarKind = 'heart' | 'style' | 'explore' | 'time' | 'local';
export type RankedSong = { song: SongResult; score: number; reason: string };
export function stableHash(text: string) {
    let value = 2166136261; for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return (value >>> 0) / 4294967296;
}
export function rankDiscovery(songs: SongResult[], preferences: PreferenceMap, settings: DiscoverySettings,
    kind: RadarKind = 'heart', seed = '', now = Date.now(), limit = 30): RankedSong[] {
    const unique = new Map(songs.map(song => [getPlaybackSongKey(song), song]));
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
        if (kind === 'time' && (!preference?.lastPlayed || now - preference.lastPlayed < 7 * 86400_000)) return;
        const affinity = song.artists.reduce((max, artist) => { const stat = artists.get(artist.name.trim().toLowerCase());
            return Math.max(max, stat ? stat.sum / stat.count : 0); }, 0);
        const familiar = preference?.listens || preference?.liked;
        let score = decayedPreference(preference, now) * settings.familiarity + affinity * (1 - settings.crossArtist);
        if (!familiar) score += 8 * settings.exploration;
        if (kind === 'style') score = affinity * 2 + score * .3;
        if (kind === 'time') score += Math.min(20, (now - preference!.lastPlayed) / 86400_000) + Math.min(10, preference!.listens);
        score += 4 * (source.kind === 'online' ? Math.max(0, Math.min(3, settings.weights[source.providerId] ?? 1)) : 1);
        score += stableHash(`${seed}:${key}`) * (2 + settings.exploration * 4);
        const reason = kind === 'time' ? '过去听过，最近较少播放' : preference?.liked ? '你收藏过这首歌' : affinity > 0 ? '与你听过的歌手有关'
            : familiar ? '根据你的收听记录' : source.kind === 'local' ? '来自你的本地曲库' : '来自已启用平台的真实推荐';
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

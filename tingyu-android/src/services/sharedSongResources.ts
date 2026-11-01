import { isCapacitorAndroid } from '../platform/runtime';
import { getTingyuPlayback } from '../platform/tingyuPlayback';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { parseEnhancedLRC, parseLRC } from '../utils/lyrics/parserCore';
import { buildColorOsLyricInfo } from '../utils/lyrics/colorOsLyricInfo';
import type { LyricData, SongResult } from '../types';

// src/services/sharedSongResources.ts
interface NativeResources {
    readSongResources(o: { songKey: string }): Promise<{ songKey: string; lyricInfo?: string; version?: string; renderModel?: string; hasWordByWord?: boolean; confirmedBy?: string; userChoice?: boolean }>;
    cacheSongLyrics(o: { songKey: string; lyricInfo: string; hasTranslation: boolean; hasWordByWord: boolean; source: string; renderModel: string }): Promise<void>;
}
/** Decode the existing authoritative raw lanes; runtime positions and user offsets are never cached. */
export const decodeSharedLyricInfo = (json: string): LyricData | null => {
    try {
        const raw = JSON.parse(json) as { lyric?: string; rawLyric?: string; translationLyric?: string };
        if (typeof raw.lyric !== 'string') return null;
        const data = raw.rawLyric
            ? parseEnhancedLRC(raw.rawLyric, raw.translationLyric ?? '')
            : parseLRC(raw.lyric, raw.translationLyric ?? '');
        return data.lines.length ? data : null;
    } catch { return null; }
};
export const readSharedLyricRecord = async (song: SongResult): Promise<{ lyrics: LyricData; confirmedBy?: string; userChoice?: boolean } | null> => {
    if (!isCapacitorAndroid()) return null;
    const key = getPlaybackSongKey(song);
    if (!key) return null;
    try {
        const result = await getTingyuPlayback<NativeResources>().readSongResources({ songKey: key });
        if (result.songKey !== key || !result.lyricInfo) return null;
        if (result.renderModel) {
            const model = JSON.parse(result.renderModel) as LyricData;
            if (Array.isArray(model.lines) && model.lines.length) return { lyrics: { ...model, resourceCacheTier: result.confirmedBy === 'native' && !result.userChoice ? 'native' : 'stage' }, confirmedBy: result.confirmedBy, userChoice: result.userChoice };
        }
        // Older stage records did not retain their lossless display model. Let the existing UI
        // cache/provider migrate it, rather than degrading TTML/partial-word styling through LRC.
        if (result.confirmedBy === 'stage') return null;
        if (result.hasWordByWord && !JSON.parse(result.lyricInfo).rawLyric) return null;
        const lyrics = decodeSharedLyricInfo(result.lyricInfo);
        return lyrics ? { lyrics: { ...lyrics, resourceCacheTier: result.confirmedBy === 'native' && !result.userChoice ? 'native' : 'stage' }, confirmedBy: result.confirmedBy, userChoice: result.userChoice } : null;
    } catch { return null; }
};
export const readSharedLyrics = async (song: SongResult): Promise<LyricData | null> => (await readSharedLyricRecord(song))?.lyrics ?? null;
export const cacheSharedLyrics = async (song: SongResult, lyrics: LyricData): Promise<void> => {
    if (!isCapacitorAndroid() || !lyrics.lines.length || lyrics.resourceCacheTier === 'native') return;
    const songKey = getPlaybackSongKey(song);
    if (!songKey) return;
    const built = buildColorOsLyricInfo({
        songId: String(song.id), title: song.name, durationMs: song.durationMs,
        lines: lyrics.lines, isWordByWord: lyrics.isWordByWord,
    });
    if (!built) return;
    try {
        await getTingyuPlayback<NativeResources>().cacheSongLyrics({
            songKey, lyricInfo: built.lyricInfo, hasTranslation: built.hasTranslation,
            hasWordByWord: lyrics.isWordByWord === true, source: 'platform-cache', renderModel: JSON.stringify(lyrics),
        });
    } catch { /* Disk/cache failure cannot interrupt playback. */ }
};

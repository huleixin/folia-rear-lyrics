import type { SongResult } from '../../types';
import type { AudioQualityPreference, OmniAudioSource } from '../../types/onlineMusic';
import { createProviderSongMetadata } from '../../utils/songMetadata';
import { getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { toPlayableAudioUrl } from '../../utils/appPlaybackHelpers';
import { getProviderPlaybackCooldown } from '../playbackRecovery/providerPlaybackCooldown';

// src/services/onlineMusic/playbackFallback.ts
// Explicit cross-provider playback. Catalog identity, likes and lyrics remain with the original
// song. Exact normalized title (including version markers), artist set and duration are required.
export const normalizeRecordingText = (value: string): string => value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

export function matchesPlaybackRecording(original: SongResult, candidate: SongResult): boolean {
    const a = createProviderSongMetadata(original), b = createProviderSongMetadata(candidate);
    const artists = (data: typeof a) => new Set(data.artists.map(artist => normalizeRecordingText(artist.name)).filter(Boolean));
    const left = artists(a), right = artists(b);
    const title = normalizeRecordingText(original.name);
    return !!title && title === normalizeRecordingText(candidate.name)
        && left.size > 0 && left.size === right.size && [...left].every(name => right.has(name))
        && a.durationMs > 0 && b.durationMs > 0 && Math.abs(a.durationMs - b.durationMs) <= Math.min(5000, a.durationMs * .03);
}

export function playbackUrlIdentity(url: string): string {
    try {
        const parsed = new URL(url);
        return /^https?:$/.test(parsed.protocol) ? parsed.origin + parsed.pathname : url;
    } catch { return url; }
}

export interface PlaybackSourceOptions {
    isCurrent?: () => boolean;
    excludedUrls?: ReadonlySet<string>;
    skipPrimary?: boolean;
}

/** A deadline also covers providers whose transport does not implement AbortSignal. */
async function bounded<T>(work: Promise<T>, ms: number, controller?: AbortController): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([work, new Promise<never>((_, reject) => {
            timer = setTimeout(() => { reject(new Error('Backup source timed out')); controller?.abort(); }, ms);
        })]);
    } finally { clearTimeout(timer); }
}

export async function resolvePlaybackFallback(song: SongResult, quality: AudioQualityPreference, options: PlaybackSourceOptions = {}): Promise<OmniAudioSource | null> {
    const original = getPlaybackSourceRef(song);
    if (original.kind !== 'online' || !['qq', 'netease', 'kugou', 'bodian', 'qishui'].includes(original.providerId)) return null;
    const { omni } = await import('./omni');
    const metadata = createProviderSongMetadata(song);
    if (!metadata.durationMs || !metadata.artists.some(artist => normalizeRecordingText(artist.name))) return null;
    const providers = omni.getProviderSummaries().filter(summary => summary.providerId !== original.providerId
        && ['qq', 'netease', 'kugou', 'bodian', 'qishui'].includes(summary.providerId) && summary.availability.configured
        && omni.getProviderCapabilities(summary.providerId).search && omni.getProviderCapabilities(summary.providerId).playback
        && !getProviderPlaybackCooldown(summary.providerId, 'play'));
    const deadline = Date.now() + 20000;
    let attempts = 0;
    const check = () => {
        if (options.isCurrent && !options.isCurrent()) throw new DOMException('Playback changed', 'AbortError');
        return Date.now() < deadline;
    };
    for (const { providerId } of providers.slice(0, 4)) {
        if (!check()) break;
        try {
            const controller = new AbortController();
            const page = await bounded(omni.searchProviderSongs(providerId, song.name + ' ' + metadata.artists[0].name,
                { limit: 20, offset: 0 }, controller.signal), Math.min(5000, deadline - Date.now()), controller);
            if (!check()) break;
            const candidates = page.items.filter(candidate => candidate.sourceRef?.kind === "online" && candidate.sourceRef.providerId === providerId && matchesPlaybackRecording(song, candidate));
            for (const candidate of candidates.slice(0, 2)) {
                if (!check() || attempts >= 4) return null;
                attempts += 1;
                try {
                    // This provider-explicit primitive cannot re-enter the fallback chain.
                    const source = await bounded(omni.getPrimaryAudioSource(candidate, quality), Math.min(6000, deadline - Date.now()));
                    if (!check()) return null;
                    const url = toPlayableAudioUrl(source?.url);
                    if (source && url && !options.excludedUrls?.has(playbackUrlIdentity(url))) {
                        return { ...source,
                            // Never reuse gain/peak values belonging to the original platform's master.
                            replayGain: { trackGain: 0, albumGain: 0, trackPeak: 1, albumPeak: 1, ...source.replayGain },
                            backupSource: { providerId, mediaId: getPlaybackSourceRef(candidate).mediaId! } };
                    }
                } catch (error) { if ((error as Error)?.name === 'AbortError') throw error; }
            }
        } catch (error) { if ((error as Error)?.name === 'AbortError') throw error; }
    }
    return null;
}

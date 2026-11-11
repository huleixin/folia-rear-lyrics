import type { LocalSong, ReplayGainMode, SongResult } from '../types';
import { calculateReplayGain } from '../utils/replayGain';
import { resolveNavidromePlaybackCarrier } from '../utils/appPlaybackGuards';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { getTrackProfile } from './automix/profileService';
import { planForMode } from './automix/transitionStrategy';
import { planCrossfade } from './automix/crossfadePlanner';
import { useAutomixSettingsStore } from '../stores/useAutomixSettingsStore';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { getPrefetchedData } from './prefetchService';

// src/services/nativeAudioProcessing.ts
// Use the same gain calculator and transition planner as the Web Audio executor.
export function nativeReplayGain(song: SongResult | null | undefined, mode: ReplayGainMode, localSong?: LocalSong): number {
    if (!song) return 1;
    const local = (localSong ?? song) as { replayGain?: number; replayGainTrackGain?: number; replayGainAlbumGain?: number; replayGainTrackPeak?: number; replayGainAlbumPeak?: number };
    const gain = resolveNavidromePlaybackCarrier(song)?.navidromeData.replayGain ?? (typeof song.replayGain === 'object' ? song.replayGain : undefined) ?? {
        trackGain: local.replayGainTrackGain ?? (typeof local.replayGain === 'number' ? local.replayGain : undefined), albumGain: local.replayGainAlbumGain,
        trackPeak: local.replayGainTrackPeak, albumPeak: local.replayGainAlbumPeak,
    };
    return calculateReplayGain(gain, mode).linearGain;
}

export function nativeTransition(from: SongResult | undefined, to: SongResult) {
    const mix = useAutomixSettingsStore.getState();
    if (!mix.automixEnabled || !from) return undefined;
    const audio = useAudioSettingsStore.getState(), playing = usePlaybackStore.getState();
    const fromKey = getPlaybackSongKey(from), toKey = getPlaybackSongKey(to);
    const fromLyrics = playing.currentSong && getPlaybackSongKey(playing.currentSong) === fromKey
        ? playing.lyrics : getPrefetchedData(from, audio.audioQuality)?.lyrics;
    const duration = playing.currentSong && getPlaybackSongKey(playing.currentSong) === fromKey && playing.duration > 0
        ? playing.duration : from.durationMs / 1000;
    const outgoing = { duration, lines: fromLyrics?.lines ?? null, profile: getTrackProfile(from) };
    const incoming = { duration: to.durationMs / 1000, lines: getPrefetchedData(to, audio.audioQuality)?.lyrics?.lines ?? null, profile: getTrackProfile(to) };
    const selected = planForMode({ mode: mix.transitionMode, crossfadeMaxSec: mix.crossfadeMaxSec, performance: false }, outgoing, incoming);
    // The native executor owns smooth overlap. A Web Audio beat-cut gesture needs its own
    // executor; until then retain a real fade instead of treating its waiting room as a fade.
    const plan = selected.style === 'beatCut' ? planCrossfade(outgoing, incoming, 5) : selected;
    if (plan.kind !== 'fade') return undefined; // Let native learn missing durations from the decoders.
    return { fromKey, toKey, fade: plan.kind === 'fade', outStartMs: Math.round(plan.outStart * 1000),
        inStartMs: Math.round(plan.inStart * 1000), overlapMs: Math.round(plan.overlap * 1000), stretch: plan.stretch };
}

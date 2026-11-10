import { BUILTIN_VISUALIZER_MODES } from '../types/visualizerModes';
import type { VisualizerMode } from '../types';

// src/utils/randomVisualizerModes.ts
// A lightweight pool contract: importing settings must not import all renderer chunks.
export const RANDOM_VISUALIZER_POOL_STORAGE_KEY = 'random_visualizer_modes';
export const RANDOM_VISUALIZER_SESSION_SEED = Math.random().toString(36).slice(2);
export type SongVisualizerPolicy = { enabled: boolean; modes: VisualizerMode[]; seed: string; initialSongKey: string };

/** Manual style changes take effect for the current song; random selection resumes on the next song. */
export class SongVisualizerPolicyTracker {
    private enabled = false;
    private initialSongKey = '';
    private songKey = '';
    private mode: VisualizerMode | undefined;
    update(enabled: boolean, modes: VisualizerMode[], songKey: string, mode: VisualizerMode): SongVisualizerPolicy {
        if (!enabled || !this.enabled || !this.initialSongKey) this.initialSongKey = songKey;
        else if (this.songKey === songKey && this.mode !== mode) this.initialSongKey = songKey;
        this.enabled = enabled; this.songKey = songKey; this.mode = mode;
        return { enabled, modes, seed: RANDOM_VISUALIZER_SESSION_SEED, initialSongKey: this.initialSongKey };
    }
}

/** Stable fallback for browser-only transports; Android uses the native shared selection receipt. */
export function pickSongVisualizerMode(pool: readonly VisualizerMode[], songKey: string, seed: string): VisualizerMode {
    const modes = normalizeRandomVisualizerModes(pool);
    let hash = 2166136261;
    for (const c of `${seed}:${songKey}`) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    return modes[(hash >>> 0) % modes.length];
}
export function normalizeRandomVisualizerModes(value: unknown): VisualizerMode[] {
    const known = new Set<string>(BUILTIN_VISUALIZER_MODES);
    const modes = Array.isArray(value) ? [...new Set(value.filter((mode): mode is string => typeof mode === 'string' && known.has(mode)))] : [];
    return modes.length ? modes : [...BUILTIN_VISUALIZER_MODES];
}
export function readRandomVisualizerModes(): VisualizerMode[] {
    try { return normalizeRandomVisualizerModes(JSON.parse(localStorage.getItem(RANDOM_VISUALIZER_POOL_STORAGE_KEY) ?? 'null')); }
    catch { return normalizeRandomVisualizerModes(null); }
}
export function pickRandomVisualizerMode(pool: readonly VisualizerMode[], current: VisualizerMode, random = Math.random): VisualizerMode {
    const choices = pool.filter(mode => mode !== current);
    const available = choices.length ? choices : pool;
    if (!available.length) return current;
    const index = Math.min(available.length - 1, Math.max(0, Math.floor(random() * available.length)));
    return available[index];
}

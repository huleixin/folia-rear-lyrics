import { BUILTIN_VISUALIZER_MODES } from '../types/visualizerModes';
import type { VisualizerMode } from '../types';

// src/utils/randomVisualizerModes.ts
// A lightweight pool contract: importing settings must not import all renderer chunks.
export const RANDOM_VISUALIZER_POOL_STORAGE_KEY = 'random_visualizer_modes';
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

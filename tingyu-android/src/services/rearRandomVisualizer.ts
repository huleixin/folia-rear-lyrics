import type { ObsBrowserSourceConfig } from '../types/obsBrowserSource';
import { normalizeRandomVisualizerModes, pickSongVisualizerMode, type SongVisualizerPolicy } from '../utils/randomVisualizerModes';

// src/services/rearRandomVisualizer.ts
// Song/config events select styles; clocks, seeks and render-mode changes never select again.
export function normalizeRearRandomPolicy(value: SongVisualizerPolicy | undefined): SongVisualizerPolicy | undefined {
    if (!value) return undefined;
    return { enabled: value.enabled === true, modes: normalizeRandomVisualizerModes(value.modes),
        seed: typeof value.seed === 'string' ? value.seed.slice(0, 160) : 'rear',
        initialSongKey: typeof value.initialSongKey === 'string' ? value.initialSongKey : '' };
}

export function resolveRearRandomVisualizer(config: ObsBrowserSourceConfig): ObsBrowserSourceConfig {
    const policy = config.randomVisualizer, key = config.playbackSongKey || String(config.song?.id ?? '');
    if (!policy?.enabled || !config.hasTrack || !key || key === policy.initialSongKey) return config;
    // Native state already picked once for this song. Both rear documents must use that receipt.
    if (config.randomVisualizerSongKey === key && config.randomVisualizerSelectedMode
        && policy.modes.includes(config.randomVisualizerSelectedMode))
        return config.visualizerMode === config.randomVisualizerSelectedMode ? config : { ...config, visualizerMode: config.randomVisualizerSelectedMode };
    const mode = pickSongVisualizerMode(policy.modes, key, policy.seed);
    return mode === config.visualizerMode ? config : { ...config, visualizerMode: mode };
}

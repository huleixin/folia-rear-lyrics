import { useEffect, useRef } from 'react';
import { isAndroidNativeRuntime } from '../utils/platform';
import { getFoliaNative } from '../platform/foliaNative';
import type { SongResult, VisualizerMode } from '../types';
import { VISUALIZER_REGISTRY } from '../components/visualizer/registry';
import { useVisualizerSettingsStore } from '../stores/useVisualizerSettingsStore';
import { pickRandomVisualizerMode, RANDOM_VISUALIZER_SESSION_SEED } from '../utils/randomVisualizerModes';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';

// Selects a registered lyric animation mode when the active track changes.
export function useRandomVisualizerMode({
    currentSong,
    enabled,
    visualizerMode,
    setVisualizerMode,
}: {
    currentSong: SongResult | null;
    enabled: boolean;
    visualizerMode: VisualizerMode;
    setVisualizerMode: (mode: VisualizerMode, options?: { notify?: boolean }) => void;
}) {
    const pool = useVisualizerSettingsStore(state => state.randomVisualizerModes);
    const observedSongIdRef = useRef<string | null>(null);
    const wasEnabledRef = useRef(enabled);

    useEffect(() => {
        const songId = currentSong ? getPlaybackSongKey(currentSong) : null;
        const wasEnabled = wasEnabledRef.current;
        wasEnabledRef.current = enabled;

        if (!enabled) {
            observedSongIdRef.current = songId;
            return;
        }

        if (!wasEnabled) {
            observedSongIdRef.current = songId;
            return;
        }

        if (songId === null) {
            return;
        }

        if (observedSongIdRef.current === null) {
            observedSongIdRef.current = songId;
            return;
        }

        if (observedSongIdRef.current === songId) {
            return;
        }

        observedSongIdRef.current = songId;
        const modes = new Set(VISUALIZER_REGISTRY.map(entry => entry.mode));
        const candidates = pool.filter(mode => modes.has(mode));
        if (!isAndroidNativeRuntime()) {
            setVisualizerMode(pickRandomVisualizerMode(candidates, visualizerMode), { notify: false });
            return;
        }
        let cancelled = false;
        const plugin = getFoliaNative<{ selectSongVisualizerMode: (value: object) => Promise<{ mode: VisualizerMode }> }>();
        void plugin.selectSongVisualizerMode({ songKey: songId, current: visualizerMode,
            policy: { enabled: true, modes: candidates, seed: RANDOM_VISUALIZER_SESSION_SEED } })
            .then(result => { if (!cancelled && candidates.includes(result.mode)) setVisualizerMode(result.mode, { notify: false }); })
            .catch(() => { if (!cancelled) setVisualizerMode(pickRandomVisualizerMode(candidates, visualizerMode), { notify: false }); });
        return () => { cancelled = true; };
    }, [currentSong, enabled, setVisualizerMode, visualizerMode, pool]);
}

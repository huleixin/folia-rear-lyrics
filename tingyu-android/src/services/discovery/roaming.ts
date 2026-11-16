import { create } from 'zustand';
import type { SongResult } from '../../types';
import { usePlaybackStore } from '../../stores/usePlaybackStore';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';

export const useDiscoveryRoaming = create<{ active: boolean; exhausted: boolean }>(() => ({ active: false, exhausted: false }));
let stop: (() => void) | undefined;
let saved: SongResult[] = [];
let owned = new Set<string>();
/** Uses the existing queue writer and playback entry; never owns a second transport. */
export function startDiscoveryRoaming(candidates: SongResult[], play: (song: SongResult, queue: SongResult[]) => void,
    append: (songs: SongResult[]) => void) {
    if (!candidates.length) return;
    if (!useDiscoveryRoaming.getState().active) saved = usePlaybackStore.getState().playQueue;
    stop?.();
    const unique = [...new Map(candidates.map(song => [getPlaybackSongKey(song), song])).values()];
    const initial = unique.slice(0, 10), remaining = unique.slice(10);
    owned = new Set(unique.map(getPlaybackSongKey));
    useDiscoveryRoaming.setState({ active: true, exhausted: false });
    play(initial[0], initial);
    let appending = false;
    stop = usePlaybackStore.subscribe(state => {
        if (appending || !state.currentSong) return;
        const key = getPlaybackSongKey(state.currentSong);
        if (!owned.has(key)) { endDiscoveryRoaming(false); return; }
        const index = state.playQueue.findIndex(song => getPlaybackSongKey(song) === key);
        if (index < 0 || state.playQueue.length - index > 4) return;
        const present = new Set(state.playQueue.map(getPlaybackSongKey));
        const batch: SongResult[] = [];
        while (remaining.length && batch.length < 10) { const song = remaining.shift()!; if (!present.has(getPlaybackSongKey(song))) batch.push(song); }
        if (!batch.length) { useDiscoveryRoaming.setState({ exhausted: true }); return; }
        appending = true; try { append(batch); } finally { appending = false; }
    });
}
export function endDiscoveryRoaming(restore = true) {
    stop?.(); stop = undefined;
    if (restore && useDiscoveryRoaming.getState().active) {
        const state = usePlaybackStore.getState(), current = state.currentSong;
        state.setPlayQueue(current ? [current, ...saved.filter(song => getPlaybackSongKey(song) !== getPlaybackSongKey(current))] : saved);
    }
    useDiscoveryRoaming.setState({ active: false, exhausted: false }); owned.clear(); saved = [];
}

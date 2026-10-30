import type { SongResult } from '../types';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';

// src/services/shufflePlayback.ts
// One stable random plan is shared by skip, automatic advance, preview and prefetch.
export function createShufflePlayback(random: () => number = Math.random) {
    let enabled = false, suspended = false;
    let queueRef: SongResult[] | null = null;
    let keys: string[] = [], remaining: string[] = [], history: string[] = [];
    let current = '', cursor = -1, pendingCursor: number | null = null;
    const shuffle = (values: string[]) => {
        for (let i = values.length - 1; i > 0; i--) {
            const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
            [values[i], values[j]] = [values[j], values[i]];
        }
        return values;
    };
    const reset = () => { queueRef = null; keys = []; remaining = []; history = []; current = ''; cursor = -1; pendingCursor = null; };
    const active = () => enabled && !suspended;
    const observe = (queue: SongResult[], song: SongResult | null) => {
        if (!active()) return;
        const key = song ? getPlaybackSongKey(song) : '';
        if (queue !== queueRef) {
            const nextKeys = [...new Set(queue.map(getPlaybackSongKey))];
            if (nextKeys.length !== keys.length || nextKeys.some((value, i) => value !== keys[i])) {
                const allowed = new Set(nextKeys);
                remaining = shuffle(nextKeys.filter(value => value !== key));
                history = history.slice(0, cursor + 1).filter(value => allowed.has(value));
                cursor = history.length - 1; pendingCursor = null;
                keys = nextKeys;
            }
            queueRef = queue;
        }
        if (key === current && history[cursor] === key) return;
        current = key;
        if (!key || !keys.includes(key)) return;
        remaining = remaining.filter(value => value !== key);
        if (pendingCursor !== null && history[pendingCursor] === key) cursor = pendingCursor;
        else if (history[cursor + 1] === key) cursor++;
        else {
            history = [...history.slice(0, cursor + 1), key].slice(-256);
            cursor = history.length - 1;
        }
        pendingCursor = null;
    };
    return {
        active,
        setEnabled(value: boolean) { if (enabled !== value) { enabled = value; reset(); } },
        setSuspended(value: boolean) { if (suspended !== value) { suspended = value; reset(); } },
        observe,
        next(queue: SongResult[], song: SongResult): SongResult | null {
            if (!active()) return null;
            // During a crossfade a preview can still describe the held outgoing track.
            // Reading that picture must not rewind the real playback history.
            const held = getPlaybackSongKey(song);
            const past = history.lastIndexOf(held);
            if (held !== current && past >= 0 && past < cursor)
                return queue.find(item => getPlaybackSongKey(item) === history[past + 1]) ?? null;
            observe(queue, song);
            const forward = history[cursor + 1];
            if (!forward && !remaining.length) remaining = shuffle(keys.filter(key => key !== current));
            const key = forward ?? remaining[0] ?? current;
            return queue.find(item => getPlaybackSongKey(item) === key) ?? null;
        },
        /**
         * 当前曲目之后的随机播放顺序（只读，不推进历史）。
         *
         * 原生要知道"下一首是谁"，而随机序列只有这里知道。给原生一份真实的洗牌结果，
         * 它就不必（也不可能）在 Kotlin 里复刻洗牌算法，两条通道也不会算出不同顺序。
         */
        forwardKeys(): string[] {
            if (!active()) return [];
            const forward = history.slice(cursor + 1);
            const seen = new Set(forward);
            return forward.concat(remaining.filter(key => !seen.has(key)));
        },
        previous(queue: SongResult[], song: SongResult, select = false): SongResult | null {
            if (!active()) return null;
            const held = getPlaybackSongKey(song);
            const past = history.lastIndexOf(held);
            if (!select && held !== current && past >= 0 && past < cursor)
                return queue.find(item => getPlaybackSongKey(item) === history[past - 1]) ?? null;
            observe(queue, song);
            if (cursor <= 0) return null;
            if (select) pendingCursor = cursor - 1;
            return queue.find(item => getPlaybackSongKey(item) === history[cursor - 1]) ?? null;
        },
    };
}
export const shufflePlayback = createShufflePlayback();

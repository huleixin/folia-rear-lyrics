import type { SongResult } from '../types';
import { getPlaybackSongKey } from './appPlaybackGuards';

// src/utils/fmQueue.ts
// 私人 FM 续歌时，新的一批里哪些能接到队列后面。

/**
 * 只留下队列里还没有、批内也不重复的歌。队列按歌曲键定位当前曲目，同一首歌出现两次会让「下一首」
 * 跳回前一次的位置；而 FM 每批都可能和之前重复（QQ 的猜你喜欢明说不保证每批是新歌）。
 */
export const freshFmSongs = (queue: readonly SongResult[], batch: readonly SongResult[]): SongResult[] => {
    const seen = new Set(queue.map(getPlaybackSongKey));
    return batch.filter(song => {
        const key = getPlaybackSongKey(song);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

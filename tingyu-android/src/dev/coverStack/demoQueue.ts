import { createShufflePlayback } from '../../services/shufflePlayback';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import type { DemoTrack } from './demoTracks';
import type { SongResult } from '../../types';

// src/dev/coverStack/demoQueue.ts
// Demo 的播放队列。随机序列直接复用正式播放器的 createShufflePlayback（同一份洗牌计划），
// 上一首 / 下一首的下标规则对齐 usePlaybackQueueController 的 handleNextTrack / handlePrevTrack：
//   - 随机模式下 next 走计划的正向序列，prev 必须取真实播放历史；
//   - 列表模式下到队尾按 loopMode 判断是否回绕，loopMode === 'one' 只在自动结束时生效。
// DemoTrack 只差几个可选字段，这里在边界处做一次类型收窄，不复制洗牌或历史逻辑。

export type LoopMode = 'off' | 'all' | 'one';

export interface QueuePreview {
    current: DemoTrack | null;
    /** [下一首, 下下首, 再下一首]，不足时短于 3 项 */
    upcoming: DemoTrack[];
    prev: DemoTrack | null;
    /** 当前曲目之后的完整播放序列（不含当前），供调试面板显示计划是否稳定 */
    plan: DemoTrack[];
    canGoNext: boolean;
    canGoPrev: boolean;
    shuffle: boolean;
    loop: LoopMode;
    size: number;
}

const asSongs = (tracks: DemoTrack[]): SongResult[] => tracks as unknown as SongResult[];
const asSong = (track: DemoTrack): SongResult => track as unknown as SongResult;

/** mulberry32：固定种子的随机源，保证每次进入 Demo 的随机序列一致 */
const seededRandom = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export type DemoQueue = ReturnType<typeof createDemoQueue>;

export const createDemoQueue = (
    tracks: DemoTrack[],
    options: { shuffle?: boolean; loop?: LoopMode; seed?: number } = {},
) => {
    let queue = [...tracks];
    let index = 0;
    let shuffleOn = options.shuffle ?? false;
    let loop: LoopMode = options.loop ?? 'all';
    const plan = createShufflePlayback(seededRandom(options.seed ?? 20261104));

    const current = (): DemoTrack | null => queue[index] ?? null;
    const keyOf = (track: DemoTrack | null) => (track ? getPlaybackSongKey(asSong(track)) : '');
    const observe = () => {
        const track = current();
        if (track) plan.observe(asSongs(queue), asSong(track));
    };

    plan.setEnabled(shuffleOn);
    observe();

    const byKey = () => new Map(queue.map(track => [keyOf(track), track]));

    /** 队列正向序列：随机模式取计划里的固定洗牌结果，列表模式按 loopMode 决定是否回绕 */
    const forwardTracks = (limit: number): DemoTrack[] => {
        // 空队列：任何方向都没有歌，别让取模算出 NaN 下标
        if (queue.length === 0) return [];
        if (shuffleOn) {
            const map = byKey();
            const direct = plan.forwardKeys()
                .map(key => map.get(key))
                .filter((track): track is DemoTrack => Boolean(track));
            if (direct.length >= limit || loop !== 'all') return direct.slice(0, limit);
            // 计划里的正向序列用完了（单曲队列、或一轮快放完）：正式播放器此时会重新洗牌，
            // 预览只保证"不为空、不重复"，按队列顺序补齐
            const seen = new Set(direct.map(keyOf));
            const wrap = queue.filter(track => !seen.has(keyOf(track)));
            const filled = [...direct];
            for (let i = 0; filled.length < limit && wrap.length > 0; i += 1) {
                filled.push(wrap[i % wrap.length]!);
            }
            return filled.slice(0, limit);
        }
        const out: DemoTrack[] = [];
        for (let step = 1; step <= Math.max(queue.length, limit); step += 1) {
            const raw = index + step;
            if (raw < queue.length) {
                out.push(queue[raw]!);
            } else if (loop === 'all') {
                out.push(queue[raw % queue.length]!);
            } else {
                break;
            }
            if (out.length >= limit) break;
        }
        return out;
    };

    const prevTrack = (): DemoTrack | null => {
        if (shuffleOn) return plan.previous(asSongs(queue), asSong(current()!), false) as unknown as DemoTrack | null;
        if (index > 0) return queue[index - 1] ?? null;
        if (loop !== 'all') return null;
        return queue[queue.length - 1] ?? null;
    };

    const snapshot = (): QueuePreview => {
        const forward = forwardTracks(Math.max(3, queue.length));
        const upcoming = forward.slice(0, 3);
        return {
            current: current(),
            upcoming,
            prev: current() ? prevTrack() : null,
            plan: forward,
            canGoNext: upcoming.length > 0,
            canGoPrev: Boolean(current() && prevTrack()),
            shuffle: shuffleOn,
            loop,
            size: queue.length,
        };
    };

    // 一次切歌只调用一次：推进队列并同步洗牌历史
    const commitNext = (): DemoTrack | null => {
        const target = forwardTracks(1)[0] ?? null;
        if (!target) return null;
        index = queue.indexOf(target);
        plan.observe(asSongs(queue), asSong(target));
        return target;
    };

    const commitPrev = (): DemoTrack | null => {
        const source = current();
        if (!source) return null;
        // select = true：让洗牌计划把游标退一格，下一次 next 才会回到刚才那首
        const target = shuffleOn
            ? (plan.previous(asSongs(queue), asSong(source), true) as unknown as DemoTrack | null)
            : prevTrack();
        if (!target) return null;
        index = queue.indexOf(target);
        plan.observe(asSongs(queue), asSong(target));
        return target;
    };

    return {
        snapshot,
        commitNext,
        commitPrev,
        setQueue(next: DemoTrack[]) {
            queue = [...next];
            index = 0;
            observe();
        },
        setShuffle(value: boolean) {
            if (value === shuffleOn) return;
            shuffleOn = value;
            plan.setEnabled(value);
            observe();
        },
        setLoop(value: LoopMode) {
            loop = value;
        },
        getShuffle: () => shuffleOn,
        getLoop: () => loop,
    };
};

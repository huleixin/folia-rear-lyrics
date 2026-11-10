import type { SongResult } from '../types';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { nextShuffleCycle } from './shuffleCycle';

// src/services/shufflePlayback.ts
// One stable random plan is shared by skip, automatic advance, preview and prefetch.
export function createShufflePlayback(random: () => number = Math.random) {
    let enabled = false, suspended = false;
    let queueRef: SongResult[] | null = null;
    let keys: string[] = [], remaining: string[] = [], history: string[] = [];
    // Persistence retains the whole determined cycle even when UI Previous history is capped.
    let recoveryPlan:string[]=[];
    let current = '', cursor = -1, pendingCursor: number | null = null;
    const shuffle = (values: string[]) => {
        for (let i = values.length - 1; i > 0; i--) {
            const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
            [values[i], values[j]] = [values[j], values[i]];
        }
        return values;
    };
    const reset = () => { queueRef = null; keys = []; remaining = []; history = []; recoveryPlan=[]; current = ''; cursor = -1; pendingCursor = null; };
    const active = () => enabled && !suspended;
    const captureRecoveryPlan=()=>{
        const tail=[...new Set([...history.slice(cursor+1),...remaining])],future=new Set(tail),allowed=new Set(keys);
        recoveryPlan=[...recoveryPlan.filter(value=>allowed.has(value)&&value!==current&&!future.has(value)),current,...tail];
    };
    const observe = (queue: SongResult[], song: SongResult | null) => {
        let reshaped=false;
        if (!active()) return;
        const key = song ? getPlaybackSongKey(song) : '';
        if (queue !== queueRef) {
            const nextKeys = [...new Set(queue.map(getPlaybackSongKey))];
            if (nextKeys.length !== keys.length || nextKeys.some((value, i) => value !== keys[i])) {
                const allowed = new Set(nextKeys);
                const known = new Set(keys);
                remaining = remaining.filter(value => allowed.has(value));
                remaining.push(...shuffle(nextKeys.filter(value => !known.has(value) && value !== key)));
                const past = history.slice(0, cursor + 1).filter(value => allowed.has(value));
                history = [...past, ...history.slice(cursor + 1).filter(value => allowed.has(value))];
                cursor = past.length - 1; pendingCursor = null;
                keys = nextKeys;reshaped=true;
            }
            queueRef = queue;
        }
        if (key === current && history[cursor] === key) {if(reshaped)captureRecoveryPlan();return;}
        if (key && key !== current && !remaining.length && cursor === history.length - 1
            && keys.includes(key) && key === nextShuffleCycle(recoveryPlan)[0]) {
            remaining = nextShuffleCycle(recoveryPlan);
            recoveryPlan = [...remaining];
        }
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
        captureRecoveryPlan();
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
            const key = forward ?? remaining[0] ?? nextShuffleCycle(recoveryPlan)[0] ?? current;
            return queue.find(item => getPlaybackSongKey(item) === key) ?? null;
        },
        /**
         * 当前曲目之后的随机播放顺序（只读，不推进历史）。
         *
         * 原生要知道"下一首是谁"，而随机序列只有这里知道。给原生一份真实的洗牌结果，
         * 它就不必（也不可能）在 Kotlin 里复刻洗牌算法，两条通道也不会算出不同顺序。
         * 1.5.0: the complete current round is synchronized; subsequent rounds use the shared deterministic cycle.
         */
        forwardKeys(): string[] {
            if (!active()) return [];
            const forward = history.slice(cursor + 1);
            const seen = new Set(forward);
            return forward.concat(remaining.filter(key => !seen.has(key)));
        },
        recoveryOrder(): string[] { return [...new Set([...recoveryPlan,...keys])]; },
        /**
         * 只读：播放历史里的上一个 key。**不推进历史、不 observe**。
         *
         * 原生封面堆叠要预取"上一首的封面"以及判断右滑能不能切歌，而随机模式的上一首
         * 只有这条历史知道（播放顺序是洗好的牌，不是列表前一条）。用它而不是 `previous(...)`：
         * 后者会顺带观察/重塑历史，渲染期间调用会产生隐式副作用。
         */
        peekPrevious(): string { return cursor > 0 ? history[cursor - 1] ?? '' : ''; },
        adoptNativePlan(queue:SongResult[],song:SongResult,order:string[]) {
            if (!active()) return;
            const key=getPlaybackSongKey(song),allowed=new Set(queue.map(getPlaybackSongKey));
            const plan=[...new Set(order)].filter(value=>allowed.has(value));
            const index=plan.indexOf(key);
            if(index<0 || plan.length!==allowed.size)return;
            observe(queue,song);
            history=history.slice(0,cursor+1);
            recoveryPlan=plan;
            remaining=plan.slice(index+1);
        },
        restorePlan(queue:SongResult[],song:SongResult,order:string[]) {
            if(!enabled)return;
            keys=[...new Set(queue.map(getPlaybackSongKey))];
            const allowed=new Set(keys);
            const plan=[...new Set([...order,...keys])].filter(key=>allowed.has(key));
            recoveryPlan=plan;current=getPlaybackSongKey(song); const index=plan.indexOf(current);
            history=index<0?[current]:plan.slice(0,index+1);cursor=history.length-1;
            remaining=plan.slice(index+1).filter(key=>key!==current);queueRef=queue;pendingCursor=null;
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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEMO_TRACKS, trackCoverUrl, type DemoTrack } from './demoTracks';
import { createDemoQueue, type DemoQueue, type LoopMode, type QueuePreview } from './demoQueue';
import { createStackAnimator, type StackAnimator, type StackCard } from './stackAnimator';
import { useStackGesture } from './useStackGesture';
import { useStackRefs } from './useStackRefs';
import { DEFAULT_PARAMS, type CoverStackParams } from './params';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import type { SongResult } from '../../types';

// src/dev/coverStack/useCoverStack.ts
// 控制器只做装配：队列、切歌编排、把动画器和手势接起来。
//   1. 一次切歌只调用一次 queue.commit*（phase 同步守卫），按钮和手势不会各算一次；
//   2. 拖动期间 p / edge 由指针直接写入，动画器不接管，所以是 1:1 跟手；
//   3. 松手后从"当前值"继续（补间或弹簧），不存在从起点重播。

export type StackPhase = 'idle' | 'drag' | 'commit' | 'spring';
export type QueueSize = 'full' | 'single' | 'empty';

type CardSlot = { from: number; to: number; moving: boolean; lag?: number };

const slotsFor = (direction: 'next' | 'prev'): CardSlot[] => (
    direction === 'next'
        // 当前离开，下面三层各上移一层，第四层从底层补入；越深越晚起步
        ? [
            { from: 0, to: 0, moving: true, lag: 0 },
            { from: 1, to: 0, moving: false, lag: 0 },
            { from: 2, to: 1, moving: false, lag: 0.1 },
            { from: 3, to: 2, moving: false, lag: 0.22 },
        ]
        // 上一首从左侧放进最上面，原来的三层依次后退一层
        : [
            { from: 0, to: 0, moving: true, lag: 0 },
            { from: 0, to: 1, moving: false, lag: 0.08 },
            { from: 1, to: 2, moving: false, lag: 0.2 },
            { from: 2, to: 3, moving: false, lag: 0.3 },
        ]
);

/** 把曲目数组变成带稳定 key 的渲染卡片：key 只跟歌曲有关，换层不会重建 DOM 元素 */
export const buildCards = (
    entries: (DemoTrack | null)[],
    slots?: CardSlot[],
): StackCard[] => {
    const seen = new Map<string, number>();
    return entries.map((song, index) => {
        const base = song ? getPlaybackSongKey(song as unknown as SongResult) : 'empty';
        const duplicate = seen.get(base) ?? 0;
        seen.set(base, duplicate + 1);
        const slot = slots?.[index];
        return {
            key: `${base}#${duplicate}`,
            song,
            from: slot ? slot.from : Math.min(index, 2),
            to: slot ? slot.to : Math.min(index, 2),
            moving: slot ? slot.moving : false,
            lag: slot?.lag ?? 0,
        };
    });
};

const restEntries = (preview: QueuePreview): (DemoTrack | null)[] => (
    [preview.current, preview.upcoming[0] ?? null, preview.upcoming[1] ?? null]
);

/**
 * 切歌期间的卡片表：当前曲目（或上一首）是 moving 那层，其余三层按 slot 递补。
 * 拖动一开始就要切到这张表 —— 否则 edge 没有作用对象，封面不会跟手。
 */
const buildTransitionList = (direction: 'next' | 'prev', preview: QueuePreview): StackCard[] => {
    const entries = direction === 'next'
        ? [preview.current, preview.upcoming[0] ?? null, preview.upcoming[1] ?? null, preview.upcoming[2] ?? null]
        : [preview.prev, preview.current, preview.upcoming[0] ?? null, preview.upcoming[1] ?? null];
    return buildCards(entries, slotsFor(direction));
};

export const useCoverStack = (params: CoverStackParams = DEFAULT_PARAMS) => {
    const queueRef = useRef<DemoQueue | null>(null);
    if (!queueRef.current) {
        queueRef.current = createDemoQueue(DEMO_TRACKS, { loop: 'all' });
    }
    const queue = queueRef.current;

    const commitDoneRef = useRef<() => void>(() => {});
    const springDoneRef = useRef<() => void>(() => {});
    const animatorRef = useRef<StackAnimator | null>(null);
    if (!animatorRef.current) {
        animatorRef.current = createStackAnimator({
            onCommitDone: () => commitDoneRef.current(),
            onSpringDone: () => springDoneRef.current(),
        });
    }
    const animator = animatorRef.current;

    const initial = useRef(queue.snapshot());
    const [preview, setPreview] = useState<QueuePreview>(initial.current);
    const [cards, setCards] = useState<StackCard[]>(() => buildCards(restEntries(initial.current)));
    const [phase, setPhase] = useState<StackPhase>('idle');

    const previewRef = useRef(preview);
    previewRef.current = preview;
    const phaseRef = useRef<StackPhase>('idle');
    /** 拖动阶段建好的过渡卡片表，松手时直接复用，避免再换一次 DOM */
    const preparedRef = useRef<StackCard[] | null>(null);
    const statsRef = useRef({ commits: 0, trigger: '—', reason: '—' });

    const setPhaseBoth = useCallback((next: StackPhase) => {
        phaseRef.current = next;
        setPhase(next);
    }, []);

    /** 封面提前解码：下一首、下下首、上一首都先装进图片缓存，切歌时不会出现空白 */
    const preload = useCallback((snapshot: QueuePreview) => {
        [snapshot.current, snapshot.prev, ...snapshot.upcoming].forEach(track => {
            const url = trackCoverUrl(track);
            if (!url) return;
            const image = new Image();
            image.decoding = 'async';
            image.src = url;
            void image.decode?.().catch(() => undefined);
        });
    }, []);

    const applyRest = useCallback((snapshot: QueuePreview) => {
        const rest = buildCards(restEntries(snapshot));
        animator.setCards(rest);
        animator.rest();
        setCards(rest);
        setPreview(snapshot);
    }, [animator]);

    /** 切歌动画结束：换成新的静止三层（此时 p=1 与静止位置完全重合，不会跳） */
    const finishCommit = useCallback(() => {
        preparedRef.current = null;
        const next = queue.snapshot();
        applyRest(next);
        setPhaseBoth('idle');
        preload(next);
    }, [applyRest, preload, queue, setPhaseBoth]);
    commitDoneRef.current = finishCommit;

    /** 回弹结束或手势取消：回到静止三层，多余的那一张撤掉 */
    const restoreRest = useCallback(() => {
        preparedRef.current = null;
        applyRest(previewRef.current);
        setPhaseBoth('idle');
    }, [applyRest, setPhaseBoth]);
    springDoneRef.current = restoreRest;

    /**
     * 开始一次切歌。startP / startEdge 是"从当前视觉状态继续"的入口：
     * 手势松手时传入拖动到的进度，按钮传入 0 / ±封面宽度。
     */
    const beginTransition = useCallback((
        direction: 'next' | 'prev',
        startP: number,
        startX: number,
        startY: number,
        velocity: { vx: number; vy: number },
        prepared?: StackCard[] | null,
    ): boolean => {
        if (phaseRef.current === 'commit') return false;
        const snapshot = previewRef.current;
        if (direction === 'next' ? !snapshot.canGoNext : !snapshot.canGoPrev) return false;
        if (direction === 'prev' && !snapshot.prev) return false;
        // 先按"切歌前"的队列生成过渡卡片，再推进队列：视觉连续，状态只更新一次
        const list = prepared ?? buildTransitionList(direction, snapshot);
        const moved = direction === 'next' ? queue.commitNext() : queue.commitPrev();
        if (!moved) return false;
        statsRef.current.commits += 1;
        setPhaseBoth('commit');
        animator.setCards(list);
        setCards(list);
        setPreview(queue.snapshot());
        animator.beginCommit(direction, startP, startX, startY, velocity.vx, velocity.vy);
        return true;
    }, [animator, queue, setPhaseBoth]);

    /** 按钮入口：与手势共用同一套 beginTransition */
    const skip = useCallback((direction: 'next' | 'prev') => {
        if (phaseRef.current !== 'idle') return;
        const snapshot = previewRef.current;
        if (direction === 'next' ? !snapshot.canGoNext : !snapshot.canGoPrev) return;
        statsRef.current.trigger = direction === 'next' ? '按钮 · 下一首' : '按钮 · 上一首';
        statsRef.current.reason = '按钮直接切歌';
        beginTransition(direction, 0, direction === 'next' ? 0 : -animator.width(), 0, { vx: 0, vy: 0 });
    }, [animator, beginTransition]);

    const onDirectionLocked = useCallback((direction: 'next' | 'prev', blocked: boolean) => {
        const snapshot = previewRef.current;
        statsRef.current.trigger = blocked
            ? '手势 · 这个方向没有歌'
            : direction === 'next' ? '手势 · 左滑抽走' : '手势 · 右滑放入';
        if (blocked) {
            // 队列这一头没有歌：只让最上面那张推一下再弹回来
            const nudge = buildCards(restEntries(snapshot), [
                { from: 0, to: 0, moving: true },
                { from: 1, to: 1, moving: false },
                { from: 2, to: 2, moving: false },
            ]);
            animator.setCards(nudge);
            setCards(nudge);
            return;
        }
        const list = buildTransitionList(direction, snapshot);
        preparedRef.current = list;
        animator.setCards(list);
        setCards(list);
    }, [animator]);

    const onGestureCommit = useCallback((
        direction: 'next' | 'prev',
        progress: number,
        edgeX: number,
        edgeY: number,
        velocity: { vx: number; vy: number },
    ) => {
        const prepared = preparedRef.current;
        preparedRef.current = null;
        if (!beginTransition(direction, progress, edgeX, edgeY, velocity, prepared)) {
            animator.springBack();
            setPhaseBoth('spring');
        }
    }, [animator, beginTransition, setPhaseBoth]);

    const { surfaceProps } = useStackGesture({
        animator,
        params,
        canGo: direction => (direction === 'next' ? previewRef.current.canGoNext : previewRef.current.canGoPrev),
        onDirectionLocked,
        onCommit: onGestureCommit,
        onPhase: next => setPhaseBoth(next),
        isBusy: () => phaseRef.current === 'commit',
        onReason: reason => { statsRef.current.reason = reason; },
    });

    const { cardRef, ghostRef, setStackElement } = useStackRefs(animator);

    useLayoutEffect(() => { animator.setCards(cards); }, [animator, cards]);
    // 调试面板改参数：立刻重建层位并重画（静止时也生效）
    useLayoutEffect(() => { animator.setParams(params); }, [animator, params]);
    useEffect(() => { preload(previewRef.current); }, [preload]);

    const setShuffle = useCallback((value: boolean) => {
        if (phaseRef.current !== 'idle') return;
        queue.setShuffle(value);
        applyRest(queue.snapshot());
    }, [applyRest, queue]);

    const setLoop = useCallback((value: LoopMode) => {
        if (phaseRef.current !== 'idle') return;
        queue.setLoop(value);
        setPreview(queue.snapshot());
    }, [queue]);

    const setQueueSize = useCallback((size: QueueSize) => {
        if (phaseRef.current !== 'idle') return;
        const tracks = size === 'empty' ? [] : size === 'single' ? DEMO_TRACKS.slice(0, 1) : DEMO_TRACKS;
        queue.setQueue(tracks);
        applyRest(queue.snapshot());
    }, [applyRest, queue]);

    return {
        cards,
        preview,
        phase,
        cardRef,
        ghostRef,
        setStackElement,
        surfaceProps,
        skip,
        setShuffle,
        setLoop,
        setQueueSize,
        telemetry: () => ({ ...animator.snapshot(), width: animator.width(), stats: statsRef.current }),
    };
};

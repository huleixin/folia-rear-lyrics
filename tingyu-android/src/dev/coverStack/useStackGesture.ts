import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { StackAnimator } from './stackAnimator';
import { rubberBand } from './motion';
import { AXIS_RATIO, DRAG_PROGRESS_LIMIT, GESTURE_SLOP, type CoverStackParams } from './params';

// src/dev/coverStack/useStackGesture.ts
// 指针手势状态机：方向锁 / 二维 1:1 跟手 / 松手判定。
// 它只负责"现在位移多少、该不该切歌"，不碰队列也不碰 React 状态；
// 判定结果通过回调交给控制器，按钮和手势因此共用同一条切歌路径。
//
// 跟手严格按触摸点算：deltaX / deltaY 直接写进 translate3d，不推任何曲线。
// 方向锁只决定"这一下算不算拖封面"，锁成横向之后纵轴照样跟随手指。

type Direction = 'next' | 'prev';

interface DragState {
    id: number;
    axis: 'none' | 'x' | 'y';
    mode: Direction;
    blocked: boolean;
    startX: number;
    startY: number;
    /** 最近 100ms 的采样点（含 x 与 y），用来算松手速度向量 */
    samples: { t: number; x: number; y: number }[];
    dx: number;
    dy: number;
}

export interface Velocity {
    vx: number;
    vy: number;
}

export interface StackGestureOptions {
    animator: StackAnimator;
    params: CoverStackParams;
    /** 该方向能不能切（队列尽头时为 false，此时只做橡皮筋） */
    canGo: (direction: Direction) => boolean;
    /** 横向方向锁定的瞬间：调用方在这里换成过渡卡片表 */
    onDirectionLocked: (direction: Direction, blocked: boolean) => void;
    /** 松手确认：从当前 p / 位移继续，不回到起点；velocity 是松手前的速度向量 */
    onCommit: (direction: Direction, progress: number, edgeX: number, edgeY: number, velocity: Velocity) => void;
    onPhase: (phase: 'drag' | 'spring') => void;
    /** 提交动画期间不接受新手势 */
    isBusy: () => boolean;
    onReason: (reason: string) => void;
}

/** 只保留最近 100ms 的采样：松手瞬间的速度不该被整段拖动平均掉 */
const pushSample = (drag: DragState, x: number, y: number, time: number) => {
    drag.samples.push({ t: time, x, y });
    while (drag.samples.length > 2 && time - drag.samples[0]!.t > 100) drag.samples.shift();
};

/** 松手速度向量（px/s）。停手超过 60ms 后按停顿时长衰减 */
const releaseVelocity = (drag: DragState, now: number): Velocity => {
    const samples = drag.samples;
    const last = samples[samples.length - 1];
    if (!last) return { vx: 0, vy: 0 };
    let first = last;
    for (let i = samples.length - 1; i >= 0; i -= 1) {
        if (last.t - samples[i]!.t > 110) break;
        first = samples[i]!;
    }
    const elapsed = last.t - first.t;
    if (elapsed <= 0) return { vx: 0, vy: 0 };
    const decay = now - last.t > 60 ? Math.max(0, 1 - (now - last.t - 60) / 220) : 1;
    return {
        vx: ((last.x - first.x) / elapsed) * 1000 * decay,
        vy: ((last.y - first.y) / elapsed) * 1000 * decay,
    };
};

export const useStackGesture = (options: StackGestureOptions) => {
    const dragRef = useRef<DragState | null>(null);
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (optionsRef.current.isBusy()) return;
        dragRef.current = {
            id: event.pointerId,
            axis: 'none',
            mode: 'next',
            blocked: false,
            startX: event.clientX,
            startY: event.clientY,
            samples: [{ t: event.timeStamp, x: event.clientX, y: event.clientY }],
            dx: 0,
            dy: 0,
        };
    }, []);

    const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        const host = optionsRef.current;
        if (!drag || drag.id !== event.pointerId) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;

        if (drag.axis === 'none') {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < GESTURE_SLOP) return;
            if (Math.abs(dx) < Math.abs(dy) * AXIS_RATIO) {
                // 以纵向为主：交还给页面滚动，本次不再接管
                drag.axis = 'y';
                dragRef.current = null;
                return;
            }
            drag.axis = 'x';
            drag.mode = dx < 0 ? 'next' : 'prev';
            // 指针可能在这一刻已经释放（合成事件、快速抬起），捕获失败不影响后续位移
            try {
                event.currentTarget.setPointerCapture?.(event.pointerId);
            } catch {
                // ignore
            }
            drag.blocked = !host.canGo(drag.mode);
            host.animator.cancel();
            host.onPhase('drag');
            host.onDirectionLocked(drag.mode, drag.blocked);
        }

        pushSample(drag, event.clientX, event.clientY, event.timeStamp);
        drag.dx = dx;
        drag.dy = dy;
        const width = host.animator.width();

        if (drag.blocked) {
            // 这一头没有歌：两个方向都给橡皮筋阻力，松手弹回
            const limit = Math.min(64, width * 0.2);
            host.animator.setDrag(rubberBand(dx, limit), rubberBand(dy, limit), 0);
            return;
        }

        const towardMode = drag.mode === 'next' ? dx <= 0 : dx >= 0;
        // 位移严格等于手指位移；反向越过起点时给一点阻力，读起来像"推不动"
        const edgeX = drag.mode === 'next'
            ? (dx <= 0 ? dx : dx * 0.3)
            : (dx >= 0 ? dx : dx * 0.3) - width;
        const edgeY = towardMode ? dy : dy * 0.3;
        const travel = drag.mode === 'next' ? -dx : dx;
        const progress = Math.min(1, Math.max(0, travel) / (width * 0.45)) * DRAG_PROGRESS_LIMIT;
        host.animator.setDrag(edgeX, edgeY, progress);
    }, []);

    const release = useCallback((drag: DragState, event: ReactPointerEvent<HTMLDivElement>) => {
        if (drag.axis !== 'x') return;
        const host = optionsRef.current;
        const width = host.animator.width();
        const { vx, vy } = releaseVelocity(drag, event.timeStamp);
        const travel = drag.mode === 'next' ? -drag.dx : drag.dx;
        const signedVx = drag.mode === 'next' ? -vx : vx;
        const distanceOk = travel >= width * host.params.commitDistance;
        // 甩动只看横向分量：纯上下滑不该切歌
        const flingOk = signedVx >= host.params.flingVelocity && travel >= width * host.params.flingMinDistance;

        if (!drag.blocked && (distanceOk || flingOk)) {
            host.onReason(`${Math.round(travel)}px / ${Math.round(signedVx)}px/s`);
            const edge = host.animator.edge();
            host.onCommit(drag.mode, host.animator.progress(), edge.x, edge.y, { vx, vy });
            return;
        }
        host.onReason(drag.blocked
            ? '这个方向没有可切的歌'
            : `位移 ${Math.round(travel)}px、速度 ${Math.round(signedVx)}px/s 都不够`);
        host.animator.springBack();
        host.onPhase('spring');
    }, []);

    const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        dragRef.current = null;
        if (!drag) return;
        release(drag, event);
    }, [release]);

    const onPointerCancel = useCallback(() => {
        const drag = dragRef.current;
        dragRef.current = null;
        // 系统收回指针（例如页面开始纵向滚动）：只要已经开始横向拖动，就柔和回弹
        if (!drag || drag.axis !== 'x') return;
        optionsRef.current.animator.springBack();
        optionsRef.current.onPhase('spring');
    }, []);

    return { surfaceProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } };
};

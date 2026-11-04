import { buildSlotFrames, frameAt } from './geometry';
import {
    clamp,
    createSpring,
    createTween,
    easeOutCubic,
    springSettled,
    stepSpring,
    stepTween,
    tweenDone,
    type Spring,
    type Tween,
} from './motion';
import { BLUR_SCALE, DEFAULT_PARAMS, type CoverStackParams } from './params';
import type { DemoTrack } from './demoTracks';

// src/dev/coverStack/stackAnimator.ts
// 逐帧写 DOM 的动画器。只认三个标量：
//   p       —— 堆叠推进进度（0 = 三层静止，1 = 下一首已接替当前）
//   edgeX/Y —— 被抽走 / 被放入那一张的二维位移（跟手时由指针直接写入）
// 拖动期间不缓动、不追帧；松手后从当前值继续（补间或弹簧）。
// 残影是同一张图的三份低透明度偏移副本，偏移方向 = 速度反方向，全程没有 filter blur。

export interface StackCard {
    key: string;
    song: DemoTrack | null;
    /** p=0 时的层位 */
    from: number;
    /** p=1 时的层位 */
    to: number;
    /** 正在被抽走或放入的那一张：二维位移由 edgeX / edgeY 驱动 */
    moving: boolean;
    /** 补位延迟：越深的层起步越晚一点（0 = 不延迟），避免几张封面完全同步移动 */
    lag?: number;
}

export type StackPhase = 'idle' | 'drag' | 'commit' | 'spring';

export interface AnimatorSnapshot {
    phase: StackPhase;
    p: number;
    edgeX: number;
    edgeY: number;
    speed: number;
    trail: number;
}

export interface AnimatorHooks {
    onCommitDone: () => void;
    onSpringDone: () => void;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** 残影：速度门槛、满值速度、基础透明度上限 */
const TRAIL_START_SPEED = 380;
const TRAIL_FULL_SPEED = 1600;
const TRAIL_BASE_ALPHA = 0.2;
/** 离场超过这个距离（相对封面宽度）就立刻结束拖影 */
const TRAIL_CUTOFF = 1.05;

export interface StackAnimator {
    setSize(width: number): void;
    setParams(params: CoverStackParams): void;
    setCards(cards: StackCard[]): void;
    register(key: string, element: HTMLElement | null): void;
    registerGhost(key: string, index: number, element: HTMLElement | null): void;
    setDrag(edgeX: number, edgeY: number, p: number): void;
    beginCommit(
        direction: 'next' | 'prev',
        fromP: number,
        fromX: number,
        fromY: number,
        velocityX: number,
        velocityY: number,
    ): void;
    springBack(): void;
    cancel(): void;
    rest(): void;
    write(): void;
    width(): number;
    progress(): number;
    edge(): { x: number; y: number };
    phase(): StackPhase;
    snapshot(): AnimatorSnapshot;
}

export const createStackAnimator = (hooks: AnimatorHooks): StackAnimator => {
    const elements = new Map<string, HTMLElement>();
    const ghosts = new Map<string, (HTMLElement | null)[]>();
    let cards: StackCard[] = [];
    let width = 320;
    let params: CoverStackParams = DEFAULT_PARAMS;
    let frames = buildSlotFrames(params);
    let p = 0;
    let edgeX = 0;
    let edgeY = 0;
    let velX = 0;
    let velY = 0;
    let lastX = 0;
    let lastY = 0;
    let phase: StackPhase = 'idle';
    let leaving = false;
    let tweenP: Tween | null = null;
    let tweenX: Tween | null = null;
    let tweenY: Tween | null = null;
    let springP: Spring | null = null;
    let springX: Spring | null = null;
    let springY: Spring | null = null;
    let raf = 0;
    let lastNow = 0;

    /** 残影透明度：只看速度，慢速恒为 0；档位与强度倍率直接乘在上面 */
    const trailAlpha = (): number => {
        const multiplier = BLUR_SCALE[params.blur] * params.blurStrength;
        if (multiplier <= 0) return 0;
        const speed = Math.hypot(velX, velY);
        if (speed < TRAIL_START_SPEED) return 0;
        if (leaving && Math.hypot(edgeX, edgeY) > width * TRAIL_CUTOFF) return 0;
        const t = Math.min(1, (speed - TRAIL_START_SPEED) / (TRAIL_FULL_SPEED - TRAIL_START_SPEED));
        return TRAIL_BASE_ALPHA * t * multiplier;
    };

    /** 三份副本沿速度反方向铺开：向左上甩，残影就往右下拖 */
    const writeGhosts = (key: string, alpha: number) => {
        const list = ghosts.get(key);
        if (!list || list.length === 0) return;
        const speed = Math.hypot(velX, velY);
        const ux = speed > 0.01 ? -velX / speed : 0;
        const uy = speed > 0.01 ? -velY / speed : 0;
        const distance = Math.min(30, speed * 0.01);
        list.forEach((element, index) => {
            if (!element) return;
            const weight = (index + 1) / list.length;
            element.style.opacity = alpha <= 0 ? '0' : (alpha * weight * 0.9).toFixed(3);
            element.style.transform = `translate3d(${round(ux * distance * weight)}px,${round(uy * distance * weight)}px,0)`;
        });
    };

    const write = () => {
        const alpha = trailAlpha();
        const tiltMax = params.dragTilt;
        for (const card of cards) {
            const element = elements.get(card.key);
            if (!element) continue;
            // 深层用经过延迟重映射的进度：p 到 1 时仍然精确落在目标层，中途比前一层慢半拍
            const local = card.lag ? Math.max(0, (p - card.lag) / (1 - card.lag)) : p;
            const frame = frameAt(frames, card.from + (card.to - card.from) * local);
            const x = frame.x + (card.moving ? edgeX : 0);
            const y = frame.y + (card.moving ? edgeY : 0);
            let rot = frame.rot;
            if (card.moving && tiltMax > 0) {
                rot += clamp(edgeX / (width * 0.5), -1, 1) * tiltMax;
            }
            element.style.transform =
                `translate3d(${round(x)}px,${round(y)}px,0) rotate(${round(rot)}deg) scale(${round(frame.scale * 1000) / 1000})`;
            if (card.moving) writeGhosts(card.key, alpha);
        }
    };

    /**
     * 用两帧之间的真实间隔估速。刻意用未截断的 elapsed：主线程卡一下再回来时位移很大、
     * 间隔也很长，用截断后的 dt 会把慢拖算成甩动、凭空生出拖影。
     */
    const measure = (elapsed: number) => {
        if (elapsed > 70) {
            velX *= 0.4;
            velY *= 0.4;
        } else if (elapsed > 0) {
            const instantX = ((edgeX - lastX) / elapsed) * 1000;
            const instantY = ((edgeY - lastY) / elapsed) * 1000;
            velX = velX * 0.55 + instantX * 0.45;
            velY = velY * 0.55 + instantY * 0.45;
        }
        lastX = edgeX;
        lastY = edgeY;
    };

    const stopLoop = () => {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        lastNow = 0;
    };

    const tick = (now: number) => {
        const elapsed = lastNow ? now - lastNow : 16.7;
        // 动画步长限制在 48ms 内，避免长间隔一帧跳完
        const dt = Math.min(48, elapsed);
        lastNow = now;

        if (phase === 'commit') {
            if (tweenP) p = stepTween(tweenP, dt);
            if (tweenX) edgeX = stepTween(tweenX, dt);
            if (tweenY) edgeY = stepTween(tweenY, dt);
            measure(elapsed);
            write();
            const done = (!tweenP || tweenDone(tweenP)) && (!tweenX || tweenDone(tweenX)) && (!tweenY || tweenDone(tweenY));
            if (done) {
                p = 1;
                raf = 0;
                lastNow = 0;
                phase = 'idle';
                hooks.onCommitDone();
                return;
            }
            raf = requestAnimationFrame(tick);
            return;
        }

        if (phase === 'spring') {
            if (springP) stepSpring(springP, 0, dt);
            if (springX) stepSpring(springX, 0, dt);
            if (springY) stepSpring(springY, 0, dt);
            p = springP ? springP.value : p;
            edgeX = springX ? springX.value : edgeX;
            edgeY = springY ? springY.value : edgeY;
            measure(elapsed);
            write();
            const settled = (spring: Spring | null) => !spring || springSettled(spring, 0);
            if (settled(springP) && settled(springX) && settled(springY)) {
                p = 0;
                edgeX = 0;
                edgeY = 0;
                velX = 0;
                velY = 0;
                write();
                raf = 0;
                lastNow = 0;
                phase = 'idle';
                hooks.onSpringDone();
                return;
            }
            raf = requestAnimationFrame(tick);
            return;
        }

        // drag：位置由指针写入（1:1），这里只负责测速并让残影随停手自然消失
        measure(elapsed);
        write();
        raf = requestAnimationFrame(tick);
    };

    const ensureLoop = () => {
        if (!raf) {
            lastNow = 0;
            lastX = edgeX;
            lastY = edgeY;
            raf = requestAnimationFrame(tick);
        }
    };

    /**
     * 离场方向 = 松手时的速度方向。只按横向"补足最低横向位移"，不把封面拉回水平线，
     * 所以沿左上 / 左下甩出时，封面就沿那条线继续飞出去。
     */
    const exitTarget = (direction: 'next' | 'prev', vx: number, vy: number) => {
        const speed = Math.hypot(vx, vy);
        const dirX = speed > 1 ? vx / speed : (direction === 'next' ? -1 : 1);
        const dirY = speed > 1 ? vy / speed : 0;
        const base = width * 1.15 * params.inertia;
        let x = dirX * base;
        let y = dirY * base;
        if (direction === 'next') {
            // 保证一定从左 / 右侧离场（偏纵向的甩动也不会停在屏幕里），同时保留原方向
            const minX = width * 0.95;
            if (Math.abs(x) < minX) {
                const k = Math.min(2.2, minX / Math.max(0.001, Math.abs(x)));
                x *= k;
                y *= k;
            }
        }
        return { x, y };
    };

    return {
        setSize(nextWidth: number) {
            if (Math.abs(nextWidth - width) < 0.5) return;
            width = nextWidth;
            frames = buildSlotFrames(params);
            write();
        },
        setParams(next: CoverStackParams) {
            params = next;
            frames = buildSlotFrames(params);
            write();
        },
        setCards(nextCards: StackCard[]) {
            cards = nextCards;
            const alive = new Set(nextCards.map(card => card.key));
            for (const key of [...elements.keys()]) if (!alive.has(key)) elements.delete(key);
            for (const key of [...ghosts.keys()]) if (!alive.has(key)) ghosts.delete(key);
            write();
        },
        register(key: string, element: HTMLElement | null) {
            if (element) elements.set(key, element);
            else elements.delete(key);
        },
        registerGhost(key: string, index: number, element: HTMLElement | null) {
            const list = ghosts.get(key) ?? [];
            list[index] = element;
            ghosts.set(key, list);
        },
        setDrag(nextEdgeX: number, nextEdgeY: number, nextP: number) {
            edgeX = nextEdgeX;
            edgeY = nextEdgeY;
            p = nextP;
            if (phase !== 'drag') {
                phase = 'drag';
                tweenP = null;
                tweenX = null;
                tweenY = null;
                springP = null;
                springX = null;
                springY = null;
                lastX = edgeX;
                lastY = edgeY;
            }
            write();
            ensureLoop();
        },
        beginCommit(direction, fromP, fromX, fromY, velocityX, velocityY) {
            p = fromP;
            edgeX = fromX;
            edgeY = fromY;
            phase = 'commit';
            leaving = direction === 'next';
            const target = direction === 'next'
                ? exitTarget(direction, velocityX, velocityY)
                : { x: 0, y: 0 };
            const duration = direction === 'next' ? params.exitDuration : params.exitDuration * 1.2;
            const remain = 1 - p;
            tweenP = createTween(p, 1, params.promoteDuration * (0.35 + 0.65 * remain), easeOutCubic);
            tweenX = createTween(edgeX, target.x, duration, easeOutCubic);
            tweenY = createTween(edgeY, target.y, duration, easeOutCubic);
            lastX = edgeX;
            lastY = edgeY;
            ensureLoop();
        },
        springBack() {
            phase = 'spring';
            springP = createSpring(p);
            springX = createSpring(edgeX);
            springY = createSpring(edgeY);
            lastX = edgeX;
            lastY = edgeY;
            ensureLoop();
        },
        cancel() {
            stopLoop();
            tweenP = null;
            tweenX = null;
            tweenY = null;
            springP = null;
            springX = null;
            springY = null;
            phase = 'idle';
        },
        rest() {
            stopLoop();
            p = 0;
            edgeX = 0;
            edgeY = 0;
            velX = 0;
            velY = 0;
            leaving = false;
            tweenP = null;
            tweenX = null;
            tweenY = null;
            springP = null;
            springX = null;
            springY = null;
            phase = 'idle';
            lastX = 0;
            lastY = 0;
            write();
        },
        write,
        width: () => width,
        progress: () => p,
        edge: () => ({ x: edgeX, y: edgeY }),
        phase: () => phase,
        snapshot: () => ({ phase, p, edgeX, edgeY, speed: Math.hypot(velX, velY), trail: trailAlpha() }),
    };
};

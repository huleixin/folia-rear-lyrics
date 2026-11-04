import { describe, expect, it } from 'vitest';
import { buildSlotFrames, frameAt } from '../../src/dev/coverStack/geometry';
import { createTween, easeOutCubic, createSpring, stepSpring, stepTween, tweenDone } from '../../src/dev/coverStack/motion';
import { createDemoQueue } from '../../src/dev/coverStack/demoQueue';
import { DEMO_TRACKS } from '../../src/dev/coverStack/demoTracks';
import { DEFAULT_PARAMS } from '../../src/dev/coverStack/params';

// test/unit/coverStack.test.ts
// 相册堆叠 Demo 的纯逻辑：三层姿态、补间/弹簧、队列预览与切歌一致性。

describe('相册堆叠姿态', () => {
    const frames = buildSlotFrames(DEFAULT_PARAMS);

    it('当前封面端正居中、100%', () => {
        expect(frames[0]).toEqual({ x: 0, y: 0, scale: 1, rot: 0 });
    });

    it('后两层是反向微旋、几乎同尺寸的错位，不是一个整齐的阶梯', () => {
        const [, second, third] = frames;
        expect(second!.rot).toBeLessThan(0);
        expect(third!.rot).toBeGreaterThan(0);
        expect(Math.abs(second!.rot)).toBeGreaterThanOrEqual(4);
        expect(Math.abs(second!.rot)).toBeLessThanOrEqual(6.5);
        expect(Math.abs(third!.rot)).toBeLessThanOrEqual(6.5);
        // 几乎同尺寸：缩放差不超过 4%
        expect(1 - second!.scale).toBeLessThan(0.04);
        expect(second!.scale - third!.scale).toBeLessThan(0.04);
        // 错位方向不同，且不重合
        expect(second!.x).not.toBeCloseTo(third!.x, 1);
        expect(second!.y).not.toBeCloseTo(third!.y, 1);
    });

    it('待补入的第四层藏在第二层（原第三层）后面：同角度、同中心、更小', () => {
        expect(frames[3]!.scale).toBeLessThan(frames[2]!.scale);
        expect(frames[3]!.x).toBeCloseTo(frames[2]!.x, 5);
        expect(frames[3]!.y).toBeCloseTo(frames[2]!.y, 5);
        expect(frames[3]!.rot).toBeCloseTo(frames[2]!.rot, 5);
    });

    it('小数层位线性插值（含角度），且不会越界', () => {
        const mid = frameAt(frames, 1.5);
        expect(mid.x).toBeCloseTo((frames[1]!.x + frames[2]!.x) / 2, 5);
        expect(mid.scale).toBeCloseTo((frames[1]!.scale + frames[2]!.scale) / 2, 5);
        expect(mid.rot).toBeCloseTo((frames[1]!.rot + frames[2]!.rot) / 2, 5);
        expect(frameAt(frames, -2)).toEqual(frames[0]);
        expect(frameAt(frames, 9)).toEqual(frames[3]);
    });
});

describe('补间与弹簧', () => {
    it('补间按缓动推进，到点停在终值上，不会过冲', () => {
        const tween = createTween(0, 100, 200, easeOutCubic);
        expect(stepTween(tween, 100)).toBeGreaterThan(50);
        expect(stepTween(tween, 400)).toBe(100);
        expect(tweenDone(tween)).toBe(true);
    });

    it('回弹弹簧收敛到 0，过冲很小', () => {
        const spring = createSpring(-120);
        spring.velocity = 900;
        let peak = 0;
        for (let i = 0; i < 120; i += 1) {
            stepSpring(spring, 0, 16);
            peak = Math.max(peak, spring.value);
        }
        expect(Math.abs(spring.value)).toBeLessThan(1);
        // 从 -120 弹回 0，过冲不超过起点的 12%
        expect(peak).toBeLessThan(120 * 0.12);
    });
});

describe('Demo 播放队列', () => {
    it('列表循环：当前 / 下一首 / 下下首 与队列一致', () => {
        const queue = createDemoQueue(DEMO_TRACKS, { loop: 'all' });
        const preview = queue.snapshot();
        expect(preview.current?.id).toBe('d1');
        expect(preview.upcoming.map(track => track.id)).toEqual(['d2', 'd3', 'd4']);
        expect(preview.prev?.id).toBe('d7');
        queue.commitNext();
        expect(queue.snapshot().current?.id).toBe('d2');
        expect(queue.snapshot().prev?.id).toBe('d1');
        queue.commitPrev();
        expect(queue.snapshot().current?.id).toBe('d1');
    });

    it('不循环时走到队尾就没有下一首', () => {
        const queue = createDemoQueue(DEMO_TRACKS, { loop: 'off' });
        for (let i = 0; i < DEMO_TRACKS.length - 1; i += 1) queue.commitNext();
        const preview = queue.snapshot();
        expect(preview.current?.id).toBe('d7');
        expect(preview.canGoNext).toBe(false);
        expect(queue.commitNext()).toBeNull();
    });

    it('随机模式：同一份计划可复现，切歌后沿计划前进，上一首取真实历史', () => {
        const first = createDemoQueue(DEMO_TRACKS, { loop: 'all', shuffle: true });
        const second = createDemoQueue(DEMO_TRACKS, { loop: 'all', shuffle: true });
        const planOf = (queue: ReturnType<typeof createDemoQueue>) => queue.snapshot().plan.map(track => track.id);
        expect(planOf(first)).toEqual(planOf(second));

        const plan = planOf(first);
        const visited = [first.snapshot().current!.id];
        for (let i = 0; i < 3; i += 1) {
            first.commitNext();
            visited.push(first.snapshot().current!.id);
        }
        expect(visited.slice(1)).toEqual(plan.slice(0, 3));
        // 上一首必须回到刚播过的那一首，而不是计划外的新随机
        first.commitPrev();
        expect(first.snapshot().current?.id).toBe(visited[2]);
    });

    it('单曲队列也能预览三层，并且不会崩', () => {
        const queue = createDemoQueue(DEMO_TRACKS.slice(0, 1), { loop: 'all' });
        expect(queue.snapshot().upcoming.map(track => track.id)).toEqual(['d1', 'd1', 'd1']);
        expect(queue.snapshot().prev?.id).toBe('d1');
        expect(queue.commitNext()?.id).toBe('d1');
    });

    it('空队列没有任何可切方向', () => {
        const queue = createDemoQueue([], { loop: 'all' });
        const preview = queue.snapshot();
        expect(preview.current).toBeNull();
        expect(preview.canGoNext).toBe(false);
        expect(preview.canGoPrev).toBe(false);
        expect(queue.commitNext()).toBeNull();
    });
});

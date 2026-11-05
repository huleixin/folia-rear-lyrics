import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    hasRegisteredModal,
    registerModalBack,
    resetModalBackStack,
    runTopModalBack,
} from '../../src/services/modalBackStack';

// test/unit/modalBackStack.test.ts
// 68600：洛雪音源弹窗在上层时，第一次返回必须只关它。
// 之前靠 Escape 事件冒泡，设置页的 keydown 处理器先 preventDefault + stopImmediatePropagation，
// 弹窗收不到返回、设置页却退了一层。这里把"谁在最上层谁先消费"钉成纯逻辑。

describe('modalBackStack', () => {
    beforeEach(() => resetModalBackStack());

    it('空栈时没有人消费返回', () => {
        expect(hasRegisteredModal()).toBe(false);
        expect(runTopModalBack()).toBe(false);
    });

    it('后打开的先消费（LIFO），一次返回只关一层', () => {
        const order: string[] = [];
        registerModalBack(() => order.push('first'));
        const removeSecond = registerModalBack(() => order.push('second'));

        expect(hasRegisteredModal()).toBe(true);
        expect(runTopModalBack()).toBe(true);
        expect(order).toEqual(['second']);

        // 第二层关闭后，下一次返回到第一层。
        removeSecond();
        expect(runTopModalBack()).toBe(true);
        expect(order).toEqual(['second', 'first']);
    });

    it('栈顶处理器自己拒绝关闭时也算"已消费"（导入进行中不能退页面）', () => {
        const close = vi.fn();
        registerModalBack(() => { /* closeDisabled：什么都不做 */ });
        expect(runTopModalBack()).toBe(true);
        expect(close).not.toHaveBeenCalled();

        // 关掉锁之后，同一个入口就能关掉了。
        resetModalBackStack();
        registerModalBack(close);
        expect(runTopModalBack()).toBe(true);
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('注销后不再参与返回，避免卸载的弹窗继续吞返回键', () => {
        const close = vi.fn();
        const remove = registerModalBack(close);
        remove();
        expect(hasRegisteredModal()).toBe(false);
        expect(runTopModalBack()).toBe(false);
        expect(close).not.toHaveBeenCalled();
    });

    it('处理器抛异常也要吞掉并继续返回 true（不能把返回键吞进异常里）', () => {
        registerModalBack(() => { throw new Error('boom'); });
        expect(runTopModalBack()).toBe(true);
    });
});

import { useCallback, useEffect, useRef } from 'react';
import type { StackAnimator } from './stackAnimator';

// src/dev/coverStack/useStackRefs.ts
// 卡片元素注册与尺寸测量。ref 回调必须是稳定引用 —— 每次都新建箭头函数的话，
// React 每次渲染都会先 ref(null) 再 ref(el)，逐帧动画会瞬间丢失作用对象。

export const useStackRefs = (animator: StackAnimator) => {
    const stackElRef = useRef<HTMLDivElement | null>(null);
    const observerRef = useRef<ResizeObserver | null>(null);
    const cardFns = useRef(new Map<string, (element: HTMLElement | null) => void>());
    const ghostFns = useRef(new Map<string, (element: HTMLElement | null) => void>());

    const cardRef = useCallback((key: string) => {
        let fn = cardFns.current.get(key);
        if (!fn) {
            fn = (element: HTMLElement | null) => animator.register(key, element);
            cardFns.current.set(key, fn);
        }
        return fn;
    }, [animator]);

    const ghostRef = useCallback((key: string, index: number) => {
        const id = `${key}:${index}`;
        let fn = ghostFns.current.get(id);
        if (!fn) {
            fn = (element: HTMLElement | null) => animator.registerGhost(key, index, element);
            ghostFns.current.set(id, fn);
        }
        return fn;
    }, [animator]);

    /** 封面宽度是手势阈值和离场距离的基准，尺寸变化时立刻重排静止层 */
    const setStackElement = useCallback((element: HTMLDivElement | null) => {
        stackElRef.current = element;
        observerRef.current?.disconnect();
        if (!element) return;
        const apply = () => animator.setSize(element.clientWidth || element.getBoundingClientRect().width);
        apply();
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(apply);
            observer.observe(element);
            observerRef.current = observer;
        }
    }, [animator]);

    useEffect(() => () => observerRef.current?.disconnect(), []);

    return { cardRef, ghostRef, setStackElement };
};

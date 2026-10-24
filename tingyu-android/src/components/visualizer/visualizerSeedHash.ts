// Copyright (c) 2026 chthollyphile
// src/components/visualizer/visualizerSeedHash.ts
// 各模式共用的确定性散列：FNV-1a 字符串散列、带盐的数字种子混合、按元素下标取 0..1 抖动。
// 不依赖全局随机状态，seek、重建、预热都得到同一帧。sonnet / tempera / lumiere 的 *Random.ts 都从这里取。

/** FNV-1a 32 位字符串散列。 */
export const hashVisualizerSeed = (value: string): number => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

/** 把数字种子与盐混合，让不同子系统（版式、装饰、逐字抖动）互不相关。 */
export const mixVisualizerSeed = (seed: number, salt: number) => (
    Math.imul((Math.trunc(seed) ^ salt) >>> 0, 2654435761) >>> 0
);

/** 按元素下标取确定性的 0..1 抖动。 */
export const visualizerHash01 = (seed: number, index: number, salt: number) => (
    mixVisualizerSeed(seed + Math.imul(index + 1, 97), salt) / 4294967296
);

// Deterministic upstream mulberry32 stream for the new Hanabi director.
export const createVisualizerRng = (seed: string | number) => {
    let state = typeof seed === 'number' ? seed >>> 0 : hashVisualizerSeed(seed);
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

/**
 * 与 createVisualizerRng(seed) 同一条流，但从第 skip 个值之后开始：mulberry32 每取一次状态加一个常数，跳过是 O(1)。
 */
export const createVisualizerRngAt = (seed: string | number, skip: number) => {
    const state = typeof seed === 'number' ? seed >>> 0 : hashVisualizerSeed(seed);
    return createVisualizerRng((state + Math.imul(skip, 0x6d2b79f5)) >>> 0);
};

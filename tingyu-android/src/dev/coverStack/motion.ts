// src/dev/coverStack/motion.ts
// 极小的运动内核：补间 + 弹簧。只处理两个标量（堆叠进度 p、位移 edge），
// 不进入 React state，也不做逐帧 CSS filter —— 所有输出都是 transform。

export type Easing = (t: number) => number;

export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3;
export const easeOutQuint: Easing = (t) => 1 - (1 - t) ** 5;
export const easeInOutSine: Easing = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

export interface Tween {
    from: number;
    to: number;
    elapsed: number;
    duration: number;
    easing: Easing;
}

export const createTween = (from: number, to: number, duration: number, easing: Easing = easeOutCubic): Tween => ({
    from,
    to,
    elapsed: 0,
    duration: Math.max(1, duration),
    easing,
});

/** 推进补间并返回当前值；到时间后返回终值（不会过冲） */
export const stepTween = (tween: Tween, dt: number): number => {
    tween.elapsed += dt;
    const t = Math.min(1, tween.elapsed / tween.duration);
    return tween.from + (tween.to - tween.from) * tween.easing(t);
};

export const tweenDone = (tween: Tween): boolean => tween.elapsed >= tween.duration;

export interface Spring {
    value: number;
    velocity: number;
}

export const createSpring = (value: number): Spring => ({ value, velocity: 0 });

/**
 * 半隐式欧拉弹簧。默认阻尼比 0.9，只有指尖级别的过冲 ——
 * 回弹要"柔和、有弹性"，但不能出现明显弹跳。
 */
export const stepSpring = (
    spring: Spring,
    target: number,
    dt: number,
    stiffness = 340,
    dampingRatio = 0.9,
): void => {
    const steps = 4;
    const h = Math.min(0.032, dt / 1000) / steps;
    const damping = 2 * dampingRatio * Math.sqrt(stiffness);
    for (let i = 0; i < steps; i += 1) {
        const accel = -stiffness * (spring.value - target) - damping * spring.velocity;
        spring.velocity += accel * h;
        spring.value += spring.velocity * h;
    }
};

export const springSettled = (spring: Spring, target: number, epsilon = 0.35, velocityEpsilon = 6): boolean => (
    Math.abs(spring.value - target) < epsilon && Math.abs(spring.velocity) < velocityEpsilon
);

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** 禁用手势方向上的橡皮筋：位移越大越推不动，最多到 maxDistance 附近 */
export const rubberBand = (distance: number, maxDistance = 44, constant = 0.55): number => {
    const magnitude = Math.abs(distance);
    if (magnitude === 0) return 0;
    const eased = (1 - 1 / ((magnitude * constant) / 100 + 1)) * 100;
    return Math.sign(distance) * Math.min(maxDistance, eased);
};

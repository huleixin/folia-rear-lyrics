import type { CSSProperties } from 'react';

// src/utils/rearFrameGeometry.ts
// Reused from wmqc97/folia-android, commit 4d86ad210d3004a61fce1378a253220b05c7fb8c (AGPL-3.0).
// Reading-frame calculations reuse this geometry without allocating its optional overscan render surface.
// 背屏「画布 + 相机平移」的几何。
//
// 相机模型：
//   - 可视区域恒为 347x212（stage），大小永远不变；
//   - 渲染面比可视区域大一圈（overscan），visualizer 画在这块大面上；
//   - 渲染中心 X/Y 移动的是「相机取景窗」在大面上的位置：
//     取景窗右移 = 画面内容右移，左侧仍然是大面上的内容，不会被裁成空白。
//
// 画布 X/Y 仍然只移动画布（可视区域）本身；效果缩放只改内容大小；
// 相机平移只改取景窗位置。三者互不改写对方的尺寸。

/**
 * 渲染面向可视区域四周多出来的宽度（CSS px）。相机最多能往两边各平移这么多。
 *
 * <p>背屏只有 347x212 CSS px，overscan 取 120 已经能覆盖「渲染中心 ±120」的调试范围；
 * 再大只会让 visualizer 的渲染面成倍变宽（Pixi / Canvas 的显存和填充率都跟着涨）。
 */
export const REAR_CAMERA_OVERSCAN = 120;

export interface RearContentFrameInput {
    /** 画布左缘（CSS px）。0 = 屏幕左缘；负数 = 移出屏幕左侧。 */
    canvasX: number;
    /** 画布上缘（CSS px）。0 = 屏幕顶缘；负数 = 移出屏幕上方。 */
    canvasY: number;
    /** 相机取景窗相对渲染面中心的水平偏移（CSS px，正数 = 画面右移）。 */
    centerOffsetX: number;
    /** 相机取景窗相对渲染面中心的垂直偏移（CSS px，正数 = 画面下移）。 */
    centerOffsetY: number;
    /** 效果缩放倍率：1 = 原始大小。 */
    effectScaleX: number;
    effectScaleY: number;
}

export interface RearContentFrame {
    /** 可视画布位置与尺寸（CSS px）。 */
    canvasLeft: number;
    canvasTop: number;
    canvasWidth: number;
    canvasHeight: number;
    /** 渲染面尺寸与相对可视区域的偏移（CSS px）。 */
    surfaceWidth: number;
    surfaceHeight: number;
    surfaceLeft: number;
    surfaceTop: number;
    /** 画布层缩放。 */
    scaleX: number;
    scaleY: number;
    /** 相机平移（渲染面层）。已按画布缩放做补偿，视觉上等于 centerOffset。 */
    cameraTranslateX: number;
    cameraTranslateY: number;
    /** 取景窗中心（屏幕坐标，仅供调试/参考）。 */
    centerX: number;
    centerY: number;
}

const readFinite = (value: number | undefined, fallback: number): number => (
    Number.isFinite(value) ? (value as number) : fallback
);

/**
 * 把「画布位置 + 相机偏移」换算成可视画布层与渲染面层各自的 transform。
 *
 * <p>可视区域尺寸由调用方给（背屏 347x212）。渲染面 = 可视区域 + 2 * overscan。
 * 相机平移作用在渲染面上；画布层只负责 canvasX/Y 与 effectScale。
 */
export const resolveRearContentFrame = ({
    stageWidth,
    stageHeight,
    frame,
}: {
    stageWidth: number;
    stageHeight: number;
    frame: RearContentFrameInput;
}): RearContentFrame => {
    const width = Math.max(1, readFinite(stageWidth, 1));
    const height = Math.max(1, readFinite(stageHeight, 1));
    const effectScaleX = Math.max(0.1, readFinite(frame.effectScaleX, 1));
    const effectScaleY = Math.max(0.1, readFinite(frame.effectScaleY, 1));
    const overscan = REAR_CAMERA_OVERSCAN;
    const centerOffsetX = readFinite(frame.centerOffsetX, 0);
    const centerOffsetY = readFinite(frame.centerOffsetY, 0);
    return {
        canvasLeft: readFinite(frame.canvasX, 0),
        canvasTop: readFinite(frame.canvasY, 0),
        canvasWidth: width,
        canvasHeight: height,
        surfaceWidth: width + overscan * 2,
        surfaceHeight: height + overscan * 2,
        surfaceLeft: -overscan,
        surfaceTop: -overscan,
        scaleX: effectScaleX,
        scaleY: effectScaleY,
        // 相机层在画布层的 scale 里面，除以 scale 让视觉位移正好等于 centerOffset。
        cameraTranslateX: centerOffsetX / effectScaleX,
        cameraTranslateY: centerOffsetY / effectScaleY,
        centerX: readFinite(frame.canvasX, 0) + width / 2 + centerOffsetX,
        centerY: readFinite(frame.canvasY, 0) + height / 2 + centerOffsetY,
    };
};

/** 可视画布层：只施加 canvasX/Y 与 effectScale。 */
export const resolveRearContentTransform = ({
    stageWidth,
    stageHeight,
    frame,
}: {
    stageWidth: number;
    stageHeight: number;
    frame: RearContentFrameInput;
}): CSSProperties => {
    const resolved = resolveRearContentFrame({ stageWidth, stageHeight, frame });
    return {
        transform: `translate(${resolved.canvasLeft.toFixed(2)}px, ${resolved.canvasTop.toFixed(2)}px) scale(${resolved.scaleX.toFixed(4)}, ${resolved.scaleY.toFixed(4)})`,
        transformOrigin: '0 0',
    };
};

/** 渲染面层：相机平移。 */
export const resolveRearCameraTransform = ({
    stageWidth,
    stageHeight,
    frame,
}: {
    stageWidth: number;
    stageHeight: number;
    frame: RearContentFrameInput;
}): CSSProperties => {
    const resolved = resolveRearContentFrame({ stageWidth, stageHeight, frame });
    return {
        transform: `translate(${resolved.cameraTranslateX.toFixed(2)}px, ${resolved.cameraTranslateY.toFixed(2)}px)`,
        transformOrigin: '0 0',
    };
};

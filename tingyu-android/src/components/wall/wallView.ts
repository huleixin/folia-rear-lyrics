// src/components/wall/wallView.ts

import type { Bounds } from './layout';

// Viewport <-> world conversions for the fixed-world wall. The pure geometry here talks about the
// world point under the seam line (the "view centre"); the DOM camera is a translation plus scale.

export type WallView = {
    /** Viewport size in screen px. */
    width: number;
    height: number;
    scale: number;
    /** Screen x of the seam's base line; the viewport's horizontal middle when omitted. */
    lineX?: number;
};

export type WallViewCenter = { x: number; y: number };

/** Same shape as the wall's DOM camera: `screen = camera + world * scale`. */
export type WallViewCamera = { x: number; y: number; scale: number };

export const getViewLineX = (view: WallView) => view.lineX ?? view.width / 2;

/**
 * The world layer's CSS transform for a camera, with the translation snapped to whole device pixels.
 * The world is deliberately not `will-change: transform` (see wall.css), and without that hint Chromium
 * aligns the layer's raster to the pixel grid: every change in the fractional part of the translation
 * throws the tiles away and rasterizes the whole visible wall again, i.e. on every frame of a wheel glide,
 * a drag or a camera tween. Moving in whole device pixels keeps that fraction fixed, so panning only moves
 * tiles, the same way the browser snaps its own scroll offsets.
 *
 * 用二维 translate 而不是 translate3d：world 的实际 bounds 远超移动 GPU 的最大纹理尺寸，
 * translate3d 会把它提成常驻合成层，任何一张磁贴做尺寸动画都要在这个巨型层上重栅格化，
 * 在安卓 WebView 上表现为「选歌时整屏闪烁」。2D transform 不建层，pan 期间 Chromium 会临时提层、
 * 结束自动降级 —— 像素对齐和这一条要一起保留，缺一个都会掉回闪烁。
 */
export const formatWorldTransform = (x: number, y: number, scale: number, devicePixelRatio = window.devicePixelRatio || 1) => {
    const snap = (value: number) => Math.round(value * devicePixelRatio) / devicePixelRatio;
    return `translate(${snap(x)}px, ${snap(y)}px) scale(${scale})`;
};

export const viewCenterFromCamera = (camera: WallViewCamera, view: WallView): WallViewCenter => ({
    x: (getViewLineX(view) - camera.x) / camera.scale,
    y: (view.height / 2 - camera.y) / camera.scale,
});

export const cameraFromViewCenter = (center: WallViewCenter, view: WallView): WallViewCamera => ({
    x: getViewLineX(view) - center.x * view.scale,
    y: view.height / 2 - center.y * view.scale,
    scale: view.scale,
});

/**
 * World rect on screen around a view centre. An open seam pushes the two halves apart, so the
 * horizontal span is widened by the seam width on both sides (as the prototype's culling does).
 */
export const getViewWorldBounds = (
    center: WallViewCenter,
    view: WallView,
    { seamWidth = 0, overscan = 0 }: { seamWidth?: number; overscan?: number } = {},
): Bounds => {
    const lineX = getViewLineX(view);
    return {
        left: center.x - (lineX + seamWidth) / view.scale - overscan,
        right: center.x + (view.width - lineX + seamWidth) / view.scale + overscan,
        top: center.y - view.height / 2 / view.scale - overscan,
        bottom: center.y + view.height / 2 / view.scale + overscan,
    };
};

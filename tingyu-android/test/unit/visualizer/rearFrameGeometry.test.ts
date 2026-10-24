import { describe, expect, it } from 'vitest';
import {
    resolveRearCameraTransform,
    resolveRearContentTransform,
} from '../../../src/utils/rearFrameGeometry';

// test/unit/visualizer/rearFrameGeometry.test.ts
// 「背屏歌词样式」窗口的实时预览和真机 RemotePlaybackStage 共用这两个换算函数。
//
// v6 相机模型：
//   - 可视画布层：translate(canvasX, canvasY) scale(effectScale)；
//   - 渲染面层：translate(centerOffset / effectScale)，渲染面比可视区域四周大 overscan；
//   - 可视区域大小恒为 347x212，相机平移不改变它。

const STAGE_WIDTH = 347;
const STAGE_HEIGHT = 212;

const baseFrame = {
    canvasX: 0,
    canvasY: 0,
    centerOffsetX: 0,
    centerOffsetY: 0,
    effectScaleX: 1,
    effectScaleY: 1,
};

describe('resolveRearContentTransform', () => {
    it('starts the visible canvas at screen 0 with no scale', () => {
        expect(resolveRearContentTransform({
            stageWidth: STAGE_WIDTH,
            stageHeight: STAGE_HEIGHT,
            frame: baseFrame,
        })).toEqual({
            transform: 'translate(0.00px, 0.00px) scale(1.0000, 1.0000)',
            transformOrigin: '0 0',
        });
    });

    it('applies the effect scale directly', () => {
        expect(resolveRearContentTransform({
            stageWidth: STAGE_WIDTH,
            stageHeight: STAGE_HEIGHT,
            frame: { ...baseFrame, effectScaleX: 1.2, effectScaleY: 0.8 },
        })).toEqual({
            transform: 'translate(0.00px, 0.00px) scale(1.2000, 0.8000)',
            transformOrigin: '0 0',
        });
    });

    it('leaves the visible canvas untouched when only the camera moves', () => {
        expect(resolveRearContentTransform({
            stageWidth: STAGE_WIDTH,
            stageHeight: STAGE_HEIGHT,
            frame: { ...baseFrame, centerOffsetX: 12, centerOffsetY: -4 },
        })).toEqual({
            transform: 'translate(0.00px, 0.00px) scale(1.0000, 1.0000)',
            transformOrigin: '0 0',
        });
    });

    it('moves the visible canvas with canvasX/Y only', () => {
        expect(resolveRearContentTransform({
            stageWidth: STAGE_WIDTH,
            stageHeight: STAGE_HEIGHT,
            frame: { ...baseFrame, canvasX: -60, canvasY: 20, centerOffsetX: 12 },
        })).toEqual({
            transform: 'translate(-60.00px, 20.00px) scale(1.0000, 1.0000)',
            transformOrigin: '0 0',
        });
    });

    it('never emits NaN for junk geometry', () => {
        const transform = resolveRearContentTransform({
            stageWidth: STAGE_WIDTH,
            stageHeight: STAGE_HEIGHT,
            frame: {
                canvasX: Number.NaN,
                canvasY: Number.NaN,
                centerOffsetX: Number.NaN,
                centerOffsetY: Number.NaN,
                effectScaleX: Number.NaN,
                effectScaleY: Number.NaN,
            },
        });
        expect(transform.transform).not.toContain('NaN');
        expect(transform.transform).toBe('translate(0.00px, 0.00px) scale(1.0000, 1.0000)');
    });
});

describe('resolveRearCameraTransform', () => {
    it('does not move the camera at the factory frame', () => {
        expect(resolveRearCameraTransform({
            stageWidth: STAGE_WIDTH,
            stageHeight: STAGE_HEIGHT,
            frame: baseFrame,
        })).toEqual({
            transform: 'translate(0.00px, 0.00px)',
            transformOrigin: '0 0',
        });
    });

    it('pans the camera by the render-centre offset', () => {
        expect(resolveRearCameraTransform({
            stageWidth: STAGE_WIDTH,
            stageHeight: STAGE_HEIGHT,
            frame: { ...baseFrame, centerOffsetX: 80, centerOffsetY: -20 },
        })).toEqual({
            transform: 'translate(80.00px, -20.00px)',
            transformOrigin: '0 0',
        });
    });

    it('compensates the pan for the effect scale', () => {
        expect(resolveRearCameraTransform({
            stageWidth: STAGE_WIDTH,
            stageHeight: STAGE_HEIGHT,
            frame: { ...baseFrame, effectScaleX: 2, effectScaleY: 4, centerOffsetX: 80, centerOffsetY: -20 },
        })).toEqual({
            transform: 'translate(40.00px, -5.00px)',
            transformOrigin: '0 0',
        });
    });
});

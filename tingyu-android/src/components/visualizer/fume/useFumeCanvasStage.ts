import { requestVisualizerAnimationFrame, cancelVisualizerAnimationFrame } from '../../../utils/visualizerFrameChannel';
import { resolveStageRenderRatio } from '../../../utils/stageRenderBudget';
import { useEffect, useRef, type RefObject } from 'react';
import { drawFumeBackground } from '../FumeBackground';
import { isGlowBlurQuantized } from '../../../utils/glowBlurQuantize';
import type { StaticBlockSnapshot } from './fumeTypes';
import { resolveFumeBackgroundView, stepFumeCamera, syncFumeCameraToArticle } from './fumeCameraStep';
import { isFumeBlockOnScreen, resolveFumeBlockTiming, resolveFumeGlowBases, resolveFumeStaticLayers, type FumeStaticLayerInput } from './fumeBlockFrame';
import { clamp } from './fumeMath';
import { createStaticBlockSnapshot, drawFumeLiveBlock, type FumeLiveBlockParams } from './fumeCanvasText';
import { FumeLiveRaster } from './fumeLiveRaster';
import { readFumeAudioLevels, type FumeStageDriver, type FumeStageScene } from './fumeStage';
import { getRearSafeInset, getVisualizerSurface, prepareVisualizerCanvas } from '../../../utils/visualizerSurface';
import { fitRearCurrentLine } from '../../../utils/rearCameraSafeArea';
import { settleFumeSurfaceEntry } from './settleFumeSurfaceEntry';

// src/components/visualizer/fume/useFumeCanvasStage.ts
// Fume's stage: one full-viewport canvas redrawn every frame - background, then every block on screen,
// waiting and passed blocks from cached snapshots, printing blocks glyph by glyph.
//
// While Lab > Fix lyric animation freeze on Linux is on, a printing block goes through FumeLiveRaster
// (drawn at a bounded set of raster scales, then placed under the camera) instead of straight under
// the camera transform, which asked Chromium's glyph cache for a new size every frame. A Pixi stage
// was built and measured as the alternative: no less CPU, 85 MiB more video memory
// (docs/linux-glyph-cache-fd-leak.md).

/** A snapshot unused this long is released; it is cheap to draw again. */
const SNAPSHOT_IDLE_MS = 15_000;

export const useFumeCanvasStage = (
    canvasRef: RefObject<HTMLCanvasElement | null>,
    scene: FumeStageScene,
    driver: FumeStageDriver,
    paused: boolean,
) => {
    const staticBlockSnapshotCacheRef = useRef<Map<string, { snapshot: StaticBlockSnapshot; lastUsed: number }>>(new Map());
    const liveRasterRef = useRef<FumeLiveRaster | null>(null);
    const { article, theme } = scene;

    useEffect(() => () => {
        liveRasterRef.current?.clear();
        releaseSnapshots(staticBlockSnapshotCacheRef.current, Number.POSITIVE_INFINITY);
    }, []);

    useEffect(() => {
        releaseSnapshots(staticBlockSnapshotCacheRef.current, Number.POSITIVE_INFINITY);
    }, [
        article,
        theme.name,
        theme.primaryColor,
        theme.secondaryColor,
        theme.accentColor,
        theme.fontStyle,
        theme.fontFamily,
        theme.fontFamilyStack,
    ]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }

        const context = canvas.getContext('2d');
        if (!context) {
            return;
        }

        const {
            lines, viewport, backgroundScene, overviewCamera, overviewStartTime, passedFadeDuration, cameraSpeed,
            cameraTrackingMode, glowIntensity, backgroundObjectOpacity, showPrintStamp, textHoldRatio, showText, staticMode,
        } = scene;
        const { currentTime, cameraState } = driver;
        liveRasterRef.current ??= new FumeLiveRaster();
        const liveRaster = liveRasterRef.current;
        let hasPrintedContent = false;

        prepareVisualizerCanvas(canvas, context, viewport.width, viewport.height);

        let settleEntry = !!getVisualizerSurface() && !cameraState.initialized && currentTime.get() > .75;
        syncFumeCameraToArticle(cameraState, article, getVisualizerSurface() ? .001 : undefined);
        let frameId = 0;
        let lastFrameAt: number | null = null;

        const draw = () => {
            const now = performance.now();
            const dt = lastFrameAt === null
                ? 1 / 60
                : clamp((now - lastFrameAt) / 1000, 1 / 240, 0.05);
            lastFrameAt = now;

            const paint = prepareVisualizerCanvas(canvas, context, viewport.width, viewport.height);

            const time = currentTime.get();
            const viewportCenterX = viewport.width * 0.5;
            const viewportCenterY = viewport.height * 0.5;
            const fumeBackgroundAudioLevels = readFumeAudioLevels(driver);

            if (!article) {
                if (!staticMode) {
                    context.save();
                    context.translate(viewportCenterX, viewportCenterY);
                    context.translate(-backgroundScene.width * 0.5, -backgroundScene.height * 0.5);
                    drawFumeBackground({
                        context,
                        scene: backgroundScene,
                        theme,
                        time: time + now * 0.00018,
                        audioLevels: fumeBackgroundAudioLevels,
                        objectOpacityMultiplier: backgroundObjectOpacity * 2,
                    });
                    context.restore();
                }

                if (!paused) {
                    frameId = requestVisualizerAnimationFrame(draw);
                }
                return;
            }

            // One-shot detection: once any block starts printing, flip hasPrintedContent
            if (!hasPrintedContent && time >= article.firstRenderableStartTime) {
                hasPrintedContent = true;
                driver.onPrintedContent();
            }

            const cameraInput = {
                article,
                time,
                now,
                dt,
                lineIndex: driver.getLineIndex(),
                viewport,
                overviewCamera,
                overviewStartTime,
                cameraSpeed,
                cameraTrackingMode,
                staticMode,
                animationIntensity: theme.animationIntensity,
                fitReadingLine: !!getVisualizerSurface(),
            };
            if (settleEntry) { settleFumeSurfaceEntry(cameraState, cameraInput); settleEntry = false; }
            const { overviewTextRestoreProgress } = stepFumeCamera(cameraState, cameraInput);
            const camera = cameraState.camera;

            const screenScale = camera.scale;

            if (!staticMode) {
                const {
                    backgroundCenterX,
                    backgroundCenterY,
                    backgroundCameraX,
                    backgroundCameraY,
                    backgroundScale,
                } = resolveFumeBackgroundView(backgroundScene, camera, viewport);

                context.save();
                context.translate(viewportCenterX, viewportCenterY);
                context.scale(backgroundScale, backgroundScale);
                context.translate(-backgroundCameraX, -backgroundCameraY);
                drawFumeBackground({
                    context,
                    scene: backgroundScene,
                    theme,
                    time,
                    audioLevels: fumeBackgroundAudioLevels,
                    objectOpacityMultiplier: backgroundObjectOpacity * 2,
                    parallax: {
                        cameraX: backgroundCameraX,
                        cameraY: backgroundCameraY,
                        originX: backgroundCenterX,
                        originY: backgroundCenterY,
                        strength: 0.72,
                    },
                });
                context.restore();
            }

            context.save();
            context.translate(viewportCenterX, viewportCenterY);
            context.scale(screenScale, screenScale);
            context.translate(-camera.x, -camera.y);

            const { activeGlowBoost, passedGlowBase } = resolveFumeGlowBases(theme.animationIntensity, glowIntensity);
            const liveParams: FumeLiveBlockParams = { time, theme, glowIntensity, activeGlowBoost, passedGlowBase, showPrintStamp };
            const staticLayerInput: FumeStaticLayerInput = {
                time,
                theme,
                passedGlowBase,
                passedFadeDuration,
                overviewTextRestoreProgress,
                snapshotScale: resolveStageRenderRatio(window.devicePixelRatio, 2),
            };

            const rasterLive = isGlowBlurQuantized();
            // A little margin so glyphs entering the screen are already drawn.
            const margin = 32 / screenScale;
            const liveFrame = {
                deviceScale: screenScale * resolveStageRenderRatio(window.devicePixelRatio, window.devicePixelRatio || 1),
                visible: {
                    left: camera.x - (viewportCenterX + paint.offsetX) / screenScale - margin,
                    top: camera.y - viewportCenterY / screenScale - margin,
                    right: camera.x + (paint.width - paint.offsetX - viewportCenterX) / screenScale + margin,
                    bottom: camera.y + viewportCenterY / screenScale + margin,
                },
            };

            if (showText) {
                for (const block of article.blocks) {
                    const safe = getRearSafeInset();
                    const isCurrent = safe && time >= block.line.startTime && time < block.line.endTime;
                    if (!isCurrent && !isFumeBlockOnScreen(block, camera, viewport, 180 + paint.offsetX)) {
                        continue;
                    }
                    if (isCurrent) context.save();
                    let currentFrame = liveFrame;
                    try {
                    // Final screen-space correction protects the current sentence even during spring overshoot.
                    // Only this block moves; the full-panel camera, background and passed lyrics keep animating.
                    if (isCurrent) {
                        const rowLeft = Math.min(...block.renderLines.map(row => row.left));
                        const rowRight = Math.max(...block.renderLines.map(row => row.left + row.width));
                        const rowTop = Math.min(...block.renderLines.map(row => row.top));
                        const rowBottom = Math.max(...block.renderLines.map(row => row.top + block.lineHeight));
                        const worldX = block.x + rowLeft, worldY = block.y + rowTop;
                        const projected = { left: viewportCenterX + (worldX - camera.x) * screenScale,
                            top: viewportCenterY + (worldY - camera.y) * screenScale,
                            width: (rowRight - rowLeft) * screenScale, height: (rowBottom - rowTop) * screenScale };
                        const fit = fitRearCurrentLine(projected, safe);
                        context.transform(fit.scale, 0, 0, fit.scale,
                            (1 - fit.scale) * worldX + (fit.left - projected.left) / screenScale,
                            (1 - fit.scale) * worldY + (fit.top - projected.top) / screenScale);
                        const fittedScale = screenScale * fit.scale;
                        // Raster cache culling must use the corrected transform, or the visible sentence gets clipped internally.
                        currentFrame = { ...liveFrame, deviceScale: fittedScale * resolveStageRenderRatio(window.devicePixelRatio, window.devicePixelRatio || 1),
                            visible: { left: worldX - fit.left / fittedScale - margin,
                                top: worldY - fit.top / fittedScale - margin,
                                right: worldX + (viewport.width - fit.left) / fittedScale + margin,
                                bottom: worldY + (viewport.height - fit.top) / fittedScale + margin } };
                        if (import.meta.env.DEV) canvas.dataset.rearCurrentBounds = JSON.stringify(fit);
                    }
                    const timing = resolveFumeBlockTiming(
                        block,
                        time,
                        lines[block.sourceLineIndex + 1]?.startTime ?? null,
                        textHoldRatio,
                    );
                    const layers = resolveFumeStaticLayers(block, timing, staticLayerInput, (spec) => {
                        let entry = staticBlockSnapshotCacheRef.current.get(spec.key);
                        if (!entry) {
                            const snapshot = createStaticBlockSnapshot(block, theme, spec.fill, spec.shadowBlur, spec.shadowColor);
                            if (!snapshot) return undefined;
                            entry = { snapshot, lastUsed: now };
                            staticBlockSnapshotCacheRef.current.set(spec.key, entry);
                        }
                        entry.lastUsed = now;
                        return entry.snapshot;
                    });

                    if (layers) {
                        for (const { snapshot, alpha } of layers) {
                            context.globalAlpha = alpha;
                            context.drawImage(
                                snapshot.canvas,
                                block.x - snapshot.padding,
                                block.y - snapshot.padding,
                                block.width + snapshot.padding * 2,
                                block.height + snapshot.padding * 2,
                            );
                        }
                        context.globalAlpha = 1;
                        continue;
                    }

                    if (!rasterLive) {
                        drawFumeLiveBlock(context, block, timing, liveParams);
                        continue;
                    }
                    const image = liveRaster.draw(block, timing, liveParams, currentFrame, now);
                    if (image) {
                        context.drawImage(image.canvas, 0, 0, image.width, image.height, image.x, image.y, image.worldWidth, image.worldHeight);
                    }
                    } finally { if (isCurrent) context.restore(); }
                }
            }
            context.restore();
            liveRaster.sweep(now);
            releaseSnapshots(staticBlockSnapshotCacheRef.current, now);

            if (!paused) {
                frameId = requestVisualizerAnimationFrame(draw);
            }
        };

        draw();
        return () => {
            cancelVisualizerAnimationFrame(frameId);
            lastFrameAt = null;
        };
    }, [article, canvasRef, driver, paused, scene, theme]);
};

/** Releases snapshots idle for longer than SNAPSHOT_IDLE_MS (all of them for `now` = Infinity). */
const releaseSnapshots = (cache: Map<string, { snapshot: StaticBlockSnapshot; lastUsed: number }>, now: number) => {
    for (const [key, entry] of cache) {
        if (now - entry.lastUsed <= SNAPSHOT_IDLE_MS) continue;
        // Give the backing store back now rather than whenever the canvas is collected.
        entry.snapshot.canvas.width = 0;
        entry.snapshot.canvas.height = 0;
        cache.delete(key);
    }
};

import { loadPixi } from '../src/components/visualizer/loadPixi';
import { createLumiereScene } from '../src/components/visualizer/lumiere/scene';
import { createLightSprites } from '../src/components/visualizer/lumiere/light/sprites';
import { LUMIERE_PROFILES } from '../src/components/visualizer/lumiere/catalog';
import { toLumiereSceneTuning } from '../src/components/visualizer/lumiere/lumiereRuntimeTuning';
import { DEFAULT_LUMIERE_TUNING, type Line } from '../src/types';
import { FALLBACK_AI_DUAL_THEME } from '../src/services/themeSanitizer';
import { getRearSafeInset } from '../src/utils/visualizerSurface';

// dev/lumiereRearProbe.ts
// Browser-only QA: every light profile, real glyph textures, nested camera/transition transforms, no React state per frame.
export async function probeLumiereProfiles() {
    document.documentElement.dataset.foliaSurface = 'rear-lyrics-panel';
    const pixi = await loadPixi(), app = new pixi.Application();
    const width = innerWidth, height = innerHeight;
    await app.init({ width, height, autoStart: false, sharedTicker: false, backgroundAlpha: 0,
        preference: 'webgl', resolution: devicePixelRatio, autoDensity: true, antialias: false });
    document.body.replaceChildren(app.canvas);
    const sprites = createLightSprites(pixi), results = [];
    const safe = getRearSafeInset()!;
    const theme = { ...FALLBACK_AI_DUAL_THEME.dark, lyricsIcons: [] };
    const text = '渐渐地忘记 赶不上明天';
    const line: Line = { fullText: text, startTime: 0, endTime: 8,
        words: [...text].map((text, i, chars) => ({ text, startTime: i * 8 / chars.length, endTime: (i + 1) * 8 / chars.length })) };
    try {
        for (const profile of LUMIERE_PROFILES) {
            const scene = createLumiereScene(pixi, { width, height, resolution: devicePixelRatio,
                seed: `profile-${profile.kind}`, theme, tuning: toLumiereSceneTuning(DEFAULT_LUMIERE_TUNING, { showText: true }),
                lines: [line], shots: [{ profile, startTime: 0, endTime: 8, lines: [0] }],
                startTime: 0, endTime: 8, sprites, opening: false });
            const holder = new pixi.Container();
            holder.pivot.set(width / 2, height / 2); holder.position.set(width / 2, height / 2);
            holder.addChild(scene.view); app.stage.addChild(holder);
            for (const time of [0.05, 2, 5, 7.95]) {
                scene.update(time); holder.scale.set(1.08);
                const bounds = scene.constrainCurrentLine!(time, safe)!;
                app.renderer.render(app.stage);
                const inside = bounds && bounds.left >= safe.left - .01 && bounds.top >= safe.top - .01
                    && bounds.left + bounds.width <= safe.left + safe.width + .01
                    && bounds.top + bounds.height <= safe.top + safe.height + .01;
                results.push({ profile: profile.kind, typography: profile.typography, time, bounds, inside: Boolean(inside) });
            }
            scene.destroy(); holder.destroy();
            await new Promise(requestAnimationFrame);
        }
    } finally {
        sprites.destroy(); app.destroy({ removeView: true });
    }
    return { width, height, safe, results };
}

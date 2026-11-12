import { readStoredNebbiaTuning } from '../../../stores/visualizerSettingsPersistence';
import { canRenderFogToFloat, NebbiaProgramBuild } from './nebbiaPrograms';

// src/components/visualizer/nebbia/nebbiaShaderWarmup.ts
// Adapted from Folia Android 449: idle, cancellable driver-cache warmup.
let completed = false;
let cancel: (() => void) | null = null;
export const cancelNebbiaShaderWarmup = () => cancel?.();

/** Only parallel-capable drivers compile offscreen; visible scenes take priority. */
export const warmNebbiaShaders = (): void => {
    if (completed || cancel || document.hidden || document.querySelector('[data-nebbia-ready]')) return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) return;
    const contextControl = gl.getExtension('WEBGL_lose_context');
    let timer = 0;
    let build: NebbiaProgramBuild | null = null;
    const finish = () => {
        window.clearTimeout(timer);
        document.removeEventListener('visibilitychange', hidden);
        if (build) build.disposeContext(contextControl);
        else contextControl?.loseContext();
        cancel = null;
    };
    const hidden = () => { if (document.hidden) finish(); };
    cancel = finish;
    document.addEventListener('visibilitychange', hidden);
    try {
        if (!gl.getExtension('KHR_parallel_shader_compile')) return finish();
        const saved = readStoredNebbiaTuning();
        build = new NebbiaProgramBuild(gl, canRenderFogToFloat(gl), saved.behind === 'aquarium' ? 'aquarium' : 'night', saved.glass);
        const startedAt = performance.now();
        const poll = () => {
            try {
                if (gl.isContextLost() || performance.now() - startedAt > 30_000) return finish();
                if (build?.poll()) { completed = true; return finish(); }
                timer = window.setTimeout(poll, 100);
            } catch { finish(); }
        };
        timer = window.setTimeout(poll, 100);
    } catch { finish(); }
};

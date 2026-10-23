import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    collectWebGL2Diagnostics,
    formatWebGL2DiagnosticsLine,
    type WebGL2Diagnostics,
} from '../../../src/utils/webglDiagnostics';

const createGl = () => {
    const constants = {
        VERSION: 0x1f02,
        VENDOR: 0x1f00,
        RENDERER: 0x1f01,
        MAX_TEXTURE_SIZE: 0x0d33,
        UNMASKED_VENDOR_WEBGL: 0x9245,
        UNMASKED_RENDERER_WEBGL: 0x9246,
    };
    const values: Record<number, unknown> = {
        [constants.VERSION]: 'WebGL 2.0 (OpenGL ES 3.0 Chromium)',
        [constants.VENDOR]: 'WebKit',
        [constants.RENDERER]: 'WebKit WebGL',
        [constants.MAX_TEXTURE_SIZE]: 8192,
        [constants.UNMASKED_VENDOR_WEBGL]: 'Qualcomm',
        [constants.UNMASKED_RENDERER_WEBGL]: 'Adreno (TM) 840',
    };
    const loseContext = vi.fn();
    return {
        constants,
        loseContext,
        gl: {
            ...constants,
            getParameter: (key: number) => values[key],
            getExtension: (name: string) => {
                if (name === 'WEBGL_debug_renderer_info') return constants;
                if (name === 'WEBGL_lose_context') return { loseContext };
                return null;
            },
        },
    };
};

const stubCanvas = (getContext: (kind: string) => unknown) => {
    vi.stubGlobal('document', {
        createElement: () => ({ getContext }),
    });
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('webglDiagnostics', () => {
    it('reports the real WebGL2 renderer and releases the probe context', () => {
        const { gl, loseContext } = createGl();
        stubCanvas(() => gl);

        const diagnostics = collectWebGL2Diagnostics();

        expect(diagnostics).toMatchObject({
            supported: true,
            version: 'WebGL 2.0 (OpenGL ES 3.0 Chromium)',
            vendor: 'Qualcomm',
            renderer: 'Adreno (TM) 840',
            maxTextureSize: 8192,
        });
        expect(loseContext).toHaveBeenCalledTimes(1);
    });

    it('reports WebGL1 fallback availability when WebGL2 is missing', () => {
        stubCanvas(kind => (kind === 'webgl2' ? null : {}));
        expect(collectWebGL2Diagnostics()).toEqual({
            supported: false,
            error: 'context-unavailable',
            webgl1: true,
        });
    });

    it('formats both supported and unsupported diagnostics', () => {
        const supported: WebGL2Diagnostics = {
            supported: true,
            version: 'WebGL 2.0',
            vendor: 'Qualcomm',
            renderer: 'Adreno (TM) 840',
            maxTextureSize: 8192,
        };
        expect(formatWebGL2DiagnosticsLine(supported)).toBe(
            '  webgl2: supported=yes version="WebGL 2.0" vendor="Qualcomm"'
            + ' renderer="Adreno (TM) 840" maxTexture=8192',
        );
        expect(formatWebGL2DiagnosticsLine({
            supported: false,
            error: 'context-unavailable',
            webgl1: false,
        })).toBe('  webgl2: supported=no error="context-unavailable" webgl1=no');
    });
});

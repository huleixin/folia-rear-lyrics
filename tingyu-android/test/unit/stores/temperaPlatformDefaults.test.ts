import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    resolveTemperaTuningDefaults,
    temperaPostProcessCompressionDefault,
} from '@/services/temperaTuningDefaults';
import { readStoredTemperaTuning } from '@/stores/visualizerSettingsPersistence';

// test/unit/stores/temperaPlatformDefaults.test.ts
// 凝彩的后处理链在安卓上默认压缩纹理：手机 GPU 的填充率撑不住全分辨率的多道全屏 pass。
// 存量存档（旧默认 false）迁移一次，之后用户手动关闭就不再覆盖。

const MIGRATION_KEY = 'tempera_android_compression_v1';

const createStorage = (initial: Record<string, string> = {}) => {
    const map = new Map(Object.entries(initial));
    return {
        map,
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => { map.set(key, value); },
        removeItem: (key: string) => { map.delete(key); },
        clear: () => map.clear(),
    };
};

const stubRuntime = (
    platform: 'android' | 'web',
    storage: ReturnType<typeof createStorage>,
) => {
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', {
        Capacitor: { getPlatform: () => platform },
        localStorage: storage,
    });
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('tempera post-process compression default', () => {
    it('keeps the upstream default outside Android', () => {
        stubRuntime('web', createStorage());

        expect(temperaPostProcessCompressionDefault()).toBe(false);
        expect(resolveTemperaTuningDefaults().postProcessTextureCompression).toBe(false);
    });

    it('turns compression on for Android', () => {
        stubRuntime('android', createStorage());

        expect(temperaPostProcessCompressionDefault()).toBe(true);
        expect(resolveTemperaTuningDefaults().postProcessTextureCompression).toBe(true);
    });
});

describe('stored tempera tuning on Android', () => {
    it('uses the compressed default when nothing was saved yet', () => {
        stubRuntime('android', createStorage());

        expect(readStoredTemperaTuning().postProcessTextureCompression).toBe(true);
    });

    it('migrates an existing uncompressed tuning once and writes it back', () => {
        const storage = createStorage({
            tempera_tuning: JSON.stringify({
                postProcessTextureCompression: false,
                textureResolution: 1.25,
            }),
        });
        stubRuntime('android', storage);

        const tuning = readStoredTemperaTuning();

        expect(tuning.postProcessTextureCompression).toBe(true);
        // 迁移只碰这一个字段，用户调过的其它参数原样保留。
        expect(tuning.textureResolution).toBe(1.25);
        expect(storage.map.get(MIGRATION_KEY)).toBe('1');
        const written = JSON.parse(storage.map.get('tempera_tuning') ?? '{}') as {
            postProcessTextureCompression?: boolean;
        };
        expect(written.postProcessTextureCompression).toBe(true);
    });

    it('respects a manual opt-out after the migration has run', () => {
        const storage = createStorage({
            [MIGRATION_KEY]: '1',
            tempera_tuning: JSON.stringify({ postProcessTextureCompression: false }),
        });
        stubRuntime('android', storage);

        expect(readStoredTemperaTuning().postProcessTextureCompression).toBe(false);
    });

    it('leaves the stored tuning alone outside Android', () => {
        const storage = createStorage({
            tempera_tuning: JSON.stringify({ postProcessTextureCompression: false }),
        });
        stubRuntime('web', storage);

        expect(readStoredTemperaTuning().postProcessTextureCompression).toBe(false);
        expect(storage.map.get(MIGRATION_KEY)).toBeUndefined();
    });
});

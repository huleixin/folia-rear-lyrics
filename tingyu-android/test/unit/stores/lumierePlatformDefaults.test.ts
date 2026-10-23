import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    lumiereRenderQualityDefault,
    resolveLumiereTuningDefaults,
} from '@/services/lumiereTuningDefaults';
import { readStoredLumiereTuning } from '@/stores/visualizerSettingsPersistence';

// test/unit/stores/lumierePlatformDefaults.test.ts
// 绘光在安卓上默认降到 balanced 画质档：只降图形组（光场、烟雾、bloom）的像素，
// 文字与画框仍按满分辨率。存量存档（旧默认 full）迁移一次，之后手动调回不再覆盖。

const MIGRATION_KEY = 'lumiere_android_quality_v1';
const STORAGE_KEY = 'lumiere_tuning';

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

describe('lumiere render quality default', () => {
    it('keeps the upstream default outside Android', () => {
        stubRuntime('web', createStorage());

        expect(lumiereRenderQualityDefault()).toBe('full');
        expect(resolveLumiereTuningDefaults().renderQuality).toBe('full');
    });

    it('drops to balanced for Android', () => {
        stubRuntime('android', createStorage());

        expect(lumiereRenderQualityDefault()).toBe('balanced');
        expect(resolveLumiereTuningDefaults().renderQuality).toBe('balanced');
    });
});

describe('stored lumiere tuning on Android', () => {
    it('uses the balanced default when nothing was saved yet', () => {
        stubRuntime('android', createStorage());

        expect(readStoredLumiereTuning().renderQuality).toBe('balanced');
    });

    it('migrates an existing full-quality tuning once and writes it back', () => {
        const storage = createStorage({
            [STORAGE_KEY]: JSON.stringify({ renderQuality: 'full', bloom: 1.4 }),
        });
        stubRuntime('android', storage);

        const tuning = readStoredLumiereTuning();

        expect(tuning.renderQuality).toBe('balanced');
        // 迁移只碰画质档，用户调过的其它参数原样保留。
        expect(tuning.bloom).toBe(1.4);
        expect(storage.map.get(MIGRATION_KEY)).toBe('1');
        const written = JSON.parse(storage.map.get(STORAGE_KEY) ?? '{}') as {
            renderQuality?: string;
        };
        expect(written.renderQuality).toBe('balanced');
    });

    it('respects a manual choice back to full after the migration ran', () => {
        const storage = createStorage({
            [MIGRATION_KEY]: '1',
            [STORAGE_KEY]: JSON.stringify({ renderQuality: 'full' }),
        });
        stubRuntime('android', storage);

        expect(readStoredLumiereTuning().renderQuality).toBe('full');
    });

    it('leaves the stored tuning alone outside Android', () => {
        const storage = createStorage({
            [STORAGE_KEY]: JSON.stringify({ renderQuality: 'full' }),
        });
        stubRuntime('web', storage);

        expect(readStoredLumiereTuning().renderQuality).toBe('full');
        expect(storage.map.get(MIGRATION_KEY)).toBeUndefined();
    });
});

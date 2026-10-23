import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    chunkUrlFromError,
    isChunkLoadError,
    recoverFromChunkLoadError,
    resetChunkLoadRecovery,
} from '../../../src/utils/chunkLoadRecovery';

const createSessionStorage = () => {
    const values = new Map<string, string>();
    return {
        get length() { return values.size; },
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
        key: (index: number) => [...values.keys()][index] ?? null,
    };
};

describe('chunkLoadRecovery', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('recognizes dynamic import failures', () => {
        expect(isChunkLoadError(new TypeError(
            'Failed to fetch dynamically imported module: https://localhost/assets/BravaisStage-DrcJCWT6.js',
        ))).toBe(true);
        expect(isChunkLoadError(new Error('loading chunk 12 failed'))).toBe(true);
        expect(isChunkLoadError(new Error('ordinary render error'))).toBe(false);
    });

    it('extracts the failed chunk url', () => {
        expect(chunkUrlFromError(new Error(
            'Failed to fetch dynamically imported module: https://localhost/assets/BravaisStage-DrcJCWT6.js',
        ))).toBe('https://localhost/assets/BravaisStage-DrcJCWT6.js');
    });

    it('reloads once per failed chunk url', () => {
        const reload = vi.fn();
        const sessionStorage = createSessionStorage();
        vi.stubGlobal('window', {
            location: { reload },
            sessionStorage,
            setTimeout: (callback: () => void) => { callback(); },
        });
        const error = new Error(
            'Failed to fetch dynamically imported module: https://localhost/assets/BravaisStage-DrcJCWT6.js',
        );

        expect(recoverFromChunkLoadError(error)).toBe(true);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(recoverFromChunkLoadError(error)).toBe(false);
        expect(reload).toHaveBeenCalledTimes(1);

        resetChunkLoadRecovery();
        expect(sessionStorage.length).toBe(0);
        expect(recoverFromChunkLoadError(error)).toBe(true);
        expect(reload).toHaveBeenCalledTimes(2);
    });
});

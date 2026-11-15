import { describe, expect, it, vi } from 'vitest';
import { installNativeMotionPreferences } from '@/services/nativeMotionPreferences';

// test/unit/services/nativeMotionPreferences.test.ts
describe('Android motion preference bridge', () => {
    it('reads initial state, forwards changes and removes its listener', async () => {
        let changed!: (value: { reducedMotion: boolean }) => void;
        const remove = vi.fn(async () => {}), update = vi.fn();
        const stop = await installNativeMotionPreferences({
            addListener: async (_, callback) => { changed = callback; return { remove }; },
            motionPreference: async () => ({ reducedMotion: true }),
        }, update);
        expect(update).toHaveBeenLastCalledWith(true);
        changed({ reducedMotion: false });
        expect(update).toHaveBeenLastCalledWith(false);
        await stop();
        expect(remove).toHaveBeenCalledOnce();
    });
    it('does not replace a newer system event with a delayed initial response', async () => {
        let changed!: (value: { reducedMotion: boolean }) => void;
        const update = vi.fn();
        await installNativeMotionPreferences({
            addListener: async (_, callback) => { changed = callback; return { remove: async () => {} }; },
            motionPreference: async () => { changed({ reducedMotion: true }); return { reducedMotion: false }; },
        }, update);
        expect(update.mock.calls).toEqual([[true]]);
    });
    it('removes the subscription when the initial read fails', async () => {
        const remove = vi.fn(async () => {}), update = vi.fn();
        await expect(installNativeMotionPreferences({
            addListener: async () => ({ remove }),
            motionPreference: async () => { throw new Error('bridge unavailable'); },
        }, update)).rejects.toThrow('bridge unavailable');
        expect(remove).toHaveBeenCalledOnce();
        expect(update).not.toHaveBeenCalled();
    });
});

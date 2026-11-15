import { chromeNative } from './nativeChrome';
import { useMotionSettingsStore } from '../stores/useMotionSettingsStore';

// src/services/nativeMotionPreferences.ts
type MotionPreference = { reducedMotion: boolean };
type MotionBridge = {
    motionPreference(): Promise<MotionPreference>;
    addListener(name: 'motionPreferenceChanged', callback: (value: MotionPreference) => void): Promise<{ remove(): Promise<void> }>;
};

/** Listen before reading; a delayed initial response must not undo a newer system change. */
export async function installNativeMotionPreferences(
    bridge: MotionBridge = chromeNative,
    update = (reduced: boolean) => useMotionSettingsStore.getState().setSystemPrefersReducedMotion(reduced),
): Promise<() => Promise<void>> {
    let revision = 0;
    const listener = await bridge.addListener('motionPreferenceChanged', value => {
        revision++;
        update(value.reducedMotion);
    });
    const readingAt = revision;
    try {
        const value = await bridge.motionPreference();
        if (revision === readingAt) update(value.reducedMotion);
    } catch (error) {
        await listener.remove();
        throw error;
    }
    return () => listener.remove();
}

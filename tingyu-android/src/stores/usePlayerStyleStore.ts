import { create } from 'zustand';
import { chromeNative } from '../services/nativeChrome';
import { isAndroidNativeRuntime } from '../utils/platform';

// A projection of the native preference. Introduction and selection belong to the native controller.
export type PlayerStyle = 'classic' | 'immersive';
export const isPlayerStyle = (value: unknown): value is PlayerStyle => value === 'classic' || value === 'immersive';
export const usePlayerStyleStore = create<{ style: PlayerStyle }>(() => ({ style: 'classic' }));
let subscription: Promise<unknown> | undefined;
let eventVersion = 0;

export async function snapshotPlayerStyle(): Promise<PlayerStyle> {
    if (!isAndroidNativeRuntime()) return 'classic';
    subscription ??= chromeNative.addListener('playerStyleChanged', value => {
        if (isPlayerStyle(value.style)) { eventVersion++; usePlayerStyleStore.setState({ style: value.style }); }
    }).catch(error => { subscription = undefined; throw error; });
    await subscription;
    const version = eventVersion;
    const value = await chromeNative.playerStyle({});
    if (!isPlayerStyle(value.style)) throw new Error('Unknown native player style');
    if (version === eventVersion) usePlayerStyleStore.setState({ style: value.style });
    return usePlayerStyleStore.getState().style;
}

export async function openPlayerStyles(): Promise<boolean> {
    if (!isAndroidNativeRuntime()) return false;
    await snapshotPlayerStyle();
    await chromeNative.playerStyle({ open: true });
    return true;
}

export async function restorePlayerStyle(style: unknown): Promise<void> {
    if (!isAndroidNativeRuntime() || !isPlayerStyle(style)) return;
    const version = eventVersion;
    const result = await chromeNative.playerStyle({ style });
    if (version === eventVersion && isPlayerStyle(result.style)) usePlayerStyleStore.setState({ style: result.style });
}

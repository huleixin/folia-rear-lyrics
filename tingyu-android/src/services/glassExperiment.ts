import { registerPlugin } from '@capacitor/core';

// src/services/glassExperiment.ts
// Local opt-in experiment; a normal build never mounts the native navigation bar.
export const GLASS_LAB = import.meta.env.VITE_TINGYU_GLASS_LAB === 'true';
export type GlassMode = 'web' | 'native' | 'xiaomi';
export type GlassStatus = { native: boolean; xiaomi: boolean; detail: string; active?: string; updates?: number };
export type GlassFrame = { session: string; enabled: boolean; mode: GlassMode; left: number; top: number; width: number; height: number;
    viewportWidth: number; alpha: number; selected: number; labels: string[] };
export const glassNative = registerPlugin<{
    probe(): Promise<GlassStatus>;
    update(frame: GlassFrame): Promise<GlassStatus>;
    hide(options: { session: string }): Promise<void>;
    addListener(name: 'navigate', callback: (value: { index: number }) => void): Promise<{ remove(): Promise<void> }>;
}>('TingyuGlass');
const KEY = 'tingyu_glass_lab_mode';
const EVENT = 'tingyu-glass-mode';
export const readGlassMode = (): GlassMode => {
    const mode = localStorage.getItem(KEY);
    return mode === 'native' || mode === 'xiaomi' ? mode : 'web';
};
export const subscribeGlassMode = (change: () => void) => {
    window.addEventListener(EVENT, change);
    return () => window.removeEventListener(EVENT, change);
};
export function setGlassMode(mode: GlassMode) {
    localStorage.setItem(KEY, mode);
    window.dispatchEvent(new Event(EVENT));
}

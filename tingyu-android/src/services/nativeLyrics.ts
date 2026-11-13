import { registerPlugin } from '@capacitor/core';
import { isAndroidNativeRuntime } from '../utils/platform';
import { setStatusMessage } from '../stores/useStatusMessageStore';

// src/services/nativeLyrics.ts
// Native settings own functionality; only visual style participates in appearance sharing.
export interface DesktopLyricsStyle {
    doubleLine: boolean; splitLines?: boolean; wordHighlight: boolean; fontSize: number; font: 'sans' | 'serif' | 'mono';
    color: string; highlight: string; opacity: number; outline: number;
}
interface LyricsPort {
    snapshot(): Promise<{ style: DesktopLyricsStyle }>;
    restoreStyle(options: { style: DesktopLyricsStyle }): Promise<void>;
    openSettings(options: { mode: 'desktop' | 'bluetooth' }): Promise<void>;
}
const port = registerPlugin<LyricsPort>('TingyuLyrics');
export const nativeLyricsAvailable = isAndroidNativeRuntime;
export async function openNativeLyricsSettings(mode: 'desktop' | 'bluetooth'): Promise<boolean> {
    if (!nativeLyricsAvailable()) return false;
    try { await port.openSettings({ mode }); return true; }
    catch { setStatusMessage({ type: 'error', text: '无法打开歌词设置，请导出诊断日志后重试' }); return false; }
}
export async function snapshotDesktopLyricsStyle(): Promise<DesktopLyricsStyle | undefined> {
    return nativeLyricsAvailable() ? (await port.snapshot()).style : undefined;
}
export async function restoreDesktopLyricsStyle(style: DesktopLyricsStyle): Promise<void> {
    if (nativeLyricsAvailable()) await port.restoreStyle({ style });
}

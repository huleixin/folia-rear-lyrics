import { COMPOSE_CHROME, PREHIDE_COMPOSE_CHROME, canUseComposeChrome, chromeNative } from './nativeChrome';

// src/services/nativePages.ts
export const nativePages = chromeNative;
export const NATIVE_FIRST=PREHIDE_COMPOSE_CHROME;
if(NATIVE_FIRST)document.documentElement.dataset.nativeFirst='true';
let capability: Promise<boolean> | undefined;
export function canUseNativePages(): Promise<boolean> {
    if (!COMPOSE_CHROME) return Promise.resolve(false);
    return capability ??= canUseComposeChrome().then(async supported => supported && (await nativePages.probe()).pages === true).catch(() => false);
}
export function absolutePageImage(url: string | null | undefined): string {
    if (!url) return '';
    try { return new URL(url, location.href).href; } catch { return ''; }
}

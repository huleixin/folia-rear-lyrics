// src/utils/platform.ts
// One place to answer "is this a Mac", so keyboard handling and the shortcut hints the user reads
// can never disagree about it. Detection is by user agent because the renderer runs both in a
// browser and in Electron, and `window.electron?.platform` only exists in the latter.

export const isMacPlatform = typeof navigator !== 'undefined'
    && navigator.userAgent.toLowerCase().includes('mac');

/**
 * The modifier a shortcut declared as `ctrl` actually uses here: Cmd on macOS, Ctrl elsewhere.
 * Shortcuts are declared once with `ctrl` and translated at the point of use, rather than each
 * declaration carrying a per-platform variant.
 */
export const isPrimaryModifierPressed = (event: KeyboardEvent): boolean => (
    isMacPlatform ? event.metaKey : event.ctrlKey
);

/** The modifier that must stay *up* for a primary-modifier shortcut to be unambiguous. */
export const isSecondaryModifierPressed = (event: KeyboardEvent): boolean => (
    isMacPlatform ? event.ctrlKey : event.metaKey
);

/** Label for the primary modifier, for shortcut hints shown in the UI. */
export const PRIMARY_MODIFIER_LABEL = isMacPlatform ? 'Cmd' : 'Ctrl';

/**
 * 是否跑在 Folia 安卓原生壳（Capacitor WebView）里，而不是桌面浏览器 / Electron。
 * 用来挑手机友好的渲染默认值（关 MSAA、限制帧率 / DPR）。做成能力探测而不是构建标记，
 * 同一份 bundle 在桌面浏览器里照常运行。
 */
export const isAndroidNativeRuntime = (): boolean => (
    typeof window !== 'undefined'
    && (window as unknown as { Capacitor?: { getPlatform?: () => string } })?.Capacitor?.getPlatform?.() === 'android'
);

/** 模块加载时求值一次：渲染器每帧读它，避免反复探测。 */
export const IS_ANDROID_WEBVIEW = isAndroidNativeRuntime();
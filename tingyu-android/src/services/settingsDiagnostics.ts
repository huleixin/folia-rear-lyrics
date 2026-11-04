import { navigationDetail, navigationDiagnosticsEnabled } from './navigationTiming';

// src/services/settingsDiagnostics.ts
// Bounded, opt-in interaction evidence. Never include field values, labels or URLs.
export function settingsDiagnostic(phase: string, detail: Record<string, unknown>) {
    if (!navigationDiagnosticsEnabled())return;
    navigationDetail(`settings:${phase}`,detail);
    console.info('[settings-interaction]', JSON.stringify({ phase, at: performance.timeOrigin + performance.now(), ...detail }));
}

export function refreshNativeSettingsDocument(reason: string) {
    document.dispatchEvent(new CustomEvent('tingyu-native-settings-refresh', { detail: { reason } }));
}

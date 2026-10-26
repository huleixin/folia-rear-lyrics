import type { RearLyricsStatus } from '../../../services/rearLyricsControl';

// src/components/modal/settings/rearLyricsSettingsModel.ts
export type RearSettingsState = 'detecting' | 'failed' | 'unsupported' | 'starting' | 'enabled' | 'disabled';

/** The persisted preference controls the button; a hidden/locked window is not a disabled preference. */
export function rearSettingsState(snapshot: RearLyricsStatus | null, failed: boolean): RearSettingsState {
    if (failed) return 'failed';
    if (!snapshot) return 'detecting';
    if (snapshot.starting) return 'starting';
    if (snapshot.enabled) return 'enabled';
    if (typeof snapshot.rearDisplayId === 'number' && snapshot.rearDisplayId < 0) return 'unsupported';
    return 'disabled';
}

export function rearSettingsCanToggle(snapshot: RearLyricsStatus | null, busy: boolean): boolean {
    if (!snapshot || busy || snapshot.starting) return false;
    // An enabled preference must remain switchable off even after the display disappears.
    return snapshot.enabled === true || (snapshot.rearDisplayId ?? -1) >= 0;
}

export function rearSettingsHint(snapshot: RearLyricsStatus | null): string | null {
    if (!snapshot || (snapshot.rearDisplayId ?? -1) < 0) return null;
    if (snapshot.backendMode === 'lsp') return snapshot.lspConnected ? null : 'rearBridge.waiting';
    if (!snapshot.shizukuAvailable) return 'options.rearLyricsStartShizuku';
    if (!snapshot.authorized) return 'options.rearLyricsAuthorize';
    return null;
}

/** Native diagnostics include timestamps; they must not invalidate the whole card each poll. */
export function rearSettingsFingerprint(snapshot: RearLyricsStatus): string {
    return JSON.stringify([snapshot.enabled, snapshot.active, snapshot.starting, snapshot.rearDisplayId,
        snapshot.shizukuAvailable, snapshot.authorized, snapshot.build, snapshot.sleeping,
        snapshot.backendMode, snapshot.lspConnected, snapshot.lspDetail]);
}

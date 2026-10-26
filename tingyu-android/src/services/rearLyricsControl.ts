import { isAndroidNativeRuntime } from '../utils/platform';
import { getFoliaNative } from '../platform/foliaNative';

// src/services/rearLyricsControl.ts
// Native preferences own this device-specific opt-in; never infer it from temporary window visibility.
export type RearLyricsStatus = {
    backendMode?: 'shizuku' | 'lsp'; lspConnected?: boolean; lspDetail?: string;
    shizukuAvailable?: boolean; authorized?: boolean; rearDisplayId?: number; active?: boolean;
    enabled?: boolean; starting?: boolean; message?: string; diagnostics?: string; build?: number;
    coverSleepEnabled?: boolean; sleeping?: boolean; sleepUnsupported?: boolean; sensorAvailable?: boolean; sleepDiagnostics?: string;
};
export type RearLyricsPlugin = {
    setRearLyricsBackend: (options: { mode: 'shizuku' | 'lsp' }) => Promise<void>;
    getRearLyricsStatus: () => Promise<RearLyricsStatus>;
    startRearLyrics: () => Promise<{ verified?: boolean }>;
    returnFromRearLyrics: () => Promise<void>;
    setRearCoverSleep: (options: { enabled: boolean }) => Promise<void>;
};
const registered = getFoliaNative<RearLyricsPlugin>();
export const rearLyricsPlugin = (): RearLyricsPlugin | null => isAndroidNativeRuntime()
    ? (window as any).Capacitor?.Plugins?.FoliaNative ?? registered : null;
export const canUseRearLyrics = () => rearLyricsPlugin() !== null;
export async function setRearLyricsBackend(mode: 'shizuku' | 'lsp') {
    const plugin = rearLyricsPlugin();
    if (!plugin) return false;
    const status = await plugin.getRearLyricsStatus();
    if (status.enabled || status.starting || status.sleeping) return false;
    await plugin.setRearLyricsBackend({ mode });
    return true;
}
export async function toggleRearCoverSleep() {
    const plugin = rearLyricsPlugin();
    if (!plugin) return false;
    const status = await plugin.getRearLyricsStatus();
    await plugin.setRearCoverSleep({ enabled: !status.coverSleepEnabled });
    return true;
}
export async function toggleRearLyrics() {
    const plugin = rearLyricsPlugin();
    if (!plugin) return false;
    const status = await plugin.getRearLyricsStatus();
    if (status.enabled) await plugin.returnFromRearLyrics(); else await plugin.startRearLyrics();
    return true;
}

import { isAndroidNativeRuntime } from '../utils/platform';
import { getFoliaNative } from '../platform/foliaNative';

// src/services/rearLyricsControl.ts
// Native preferences own this device-specific opt-in; never infer it from temporary window visibility.
/** Which rear-screen controller is running. `legacy` is the one-tap rollback. */
export type RearControlEngine = 'plan-a' | 'legacy';
/**
 * 锁屏后的启动路线（A/B）。
 * - auto：看得见就复用，看不见就走 1.3.39 的「Display 0 暂存 → 迁移」；
 * - reuse：只让已有任务回前台，永不迁移；
 * - migrate：无条件迁移。
 * 只影响 Shizuku；LSP 的判定未改。
 */
export type RearLockedRoute = 'auto' | 'reuse' | 'migrate';
export type RearLyricsStatus = {
    backendMode?: 'shizuku' | 'lsp'; lspConnected?: boolean; lspDetail?: string;
    controlEngine?: RearControlEngine; lockedRoute?: RearLockedRoute; lastLaunchRoute?: string;
    returnedToSystem?: boolean; pauseReturnSeconds?: number;
    shizukuAvailable?: boolean; authorized?: boolean; rearDisplayId?: number; active?: boolean;
    enabled?: boolean; starting?: boolean; message?: string; diagnostics?: string; build?: number;
    coverSleepEnabled?: boolean; sleeping?: boolean; sleepUnsupported?: boolean; sensorAvailable?: boolean; sleepDiagnostics?: string;
};
export type RearLyricsPlugin = {
    setRearLyricsBackend: (options: { mode: 'shizuku' | 'lsp' }) => Promise<void>;
    setRearControlEngine: (options: { engine: RearControlEngine }) => Promise<{ engine?: RearControlEngine }>;
    setRearLockedRoute: (options: { mode: RearLockedRoute }) => Promise<{ lockedRoute?: RearLockedRoute }>;
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
/** One-tap rollback of the rear-screen controller; both engines stay compiled in. */
export async function setRearControlEngine(engine: RearControlEngine) {
    const plugin = rearLyricsPlugin();
    if (!plugin) return false;
    const status = await plugin.getRearLyricsStatus();
    if (status.enabled || status.starting || status.sleeping) return false;
    const result = await plugin.setRearControlEngine({ engine });
    return result?.engine === engine;
}
/** A/B for the locked-screen path. Cheap to flip so a device test can compare both. */
export async function setRearLockedRoute(mode: RearLockedRoute) {
    const plugin = rearLyricsPlugin();
    if (!plugin) return false;
    const result = await plugin.setRearLockedRoute({ mode });
    return result?.lockedRoute === mode;
}
export async function toggleRearCoverSleep() {    const plugin = rearLyricsPlugin();
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

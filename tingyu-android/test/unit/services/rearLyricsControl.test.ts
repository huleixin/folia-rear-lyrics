import { afterEach, describe, expect, it, vi } from 'vitest';
import { canUseRearLyrics, toggleRearLyrics } from '../../../src/services/rearLyricsControl';

// test/unit/services/rearLyricsControl.test.ts
// A temporarily hidden window must not turn an enabled setting back into a start button.
afterEach(() => vi.unstubAllGlobals());
function install(status: { enabled: boolean; active: boolean }) {
    const plugin = { getRearLyricsStatus: vi.fn().mockResolvedValue(status),
        startRearLyrics: vi.fn().mockResolvedValue({ verified: true }), returnFromRearLyrics: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android', Plugins: { FoliaNative: plugin } } });
    return plugin;
}
describe('rear lyrics persistent control', () => {
    it('does not expose native actions in a desktop browser', async () => {
        vi.stubGlobal('window', {});
        expect(canUseRearLyrics()).toBe(false);
        expect(await toggleRearLyrics()).toBe(false);
    });
    it('starts when the persistent setting is off', async () => {
        const plugin = install({ enabled: false, active: false });
        expect(await toggleRearLyrics()).toBe(true);
        expect(plugin.startRearLyrics).toHaveBeenCalledOnce();
        expect(plugin.returnFromRearLyrics).not.toHaveBeenCalled();
    });
    it('can disable after locking hides the window', async () => {
        const plugin = install({ enabled: true, active: false });
        await toggleRearLyrics();
        expect(plugin.returnFromRearLyrics).toHaveBeenCalledOnce();
        expect(plugin.startRearLyrics).not.toHaveBeenCalled();
    });
    it('can disable an active window', async () => {
        const plugin = install({ enabled: true, active: true });
        await toggleRearLyrics();
        expect(plugin.returnFromRearLyrics).toHaveBeenCalledOnce();
    });
});

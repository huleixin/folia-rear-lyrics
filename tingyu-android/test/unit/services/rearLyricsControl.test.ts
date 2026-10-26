import { afterEach, describe, expect, it, vi } from 'vitest';
import { canUseRearLyrics, toggleRearLyrics, setRearLyricsBackend, type RearLyricsStatus } from '../../../src/services/rearLyricsControl';
import { rearSettingsHint, rearSettingsFingerprint } from '../../../src/components/modal/settings/rearLyricsSettingsModel';

// test/unit/services/rearLyricsControl.test.ts
// A temporarily hidden window must not turn an enabled setting back into a start button.
afterEach(() => vi.unstubAllGlobals());
function install(status: RearLyricsStatus) {
    const plugin = { getRearLyricsStatus: vi.fn().mockResolvedValue(status),
        startRearLyrics: vi.fn().mockResolvedValue({ verified: true }), returnFromRearLyrics: vi.fn().mockResolvedValue(undefined),
        setRearLyricsBackend: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android', Plugins: { FoliaNative: plugin } } });
    return plugin;
}
describe('rear lyrics persistent control', () => {
    it('switches a closed stage to LSP without starting either stage', async () => {
        const plugin = install({ enabled: false, active: false });
        expect(await setRearLyricsBackend('lsp')).toBe(true);
        expect(plugin.setRearLyricsBackend).toHaveBeenCalledWith({ mode: 'lsp' });
        expect(plugin.startRearLyrics).not.toHaveBeenCalled();
    });
    it.each([{ enabled: true }, { starting: true }, { sleeping: true }])('never switches during a live rear session: %o', async status => {
        const plugin = install(status);
        expect(await setRearLyricsBackend('lsp')).toBe(false);
        expect(plugin.setRearLyricsBackend).not.toHaveBeenCalled();
    });
    it('does not require Shizuku permission when the LSP bridge is selected', () => {
        expect(rearSettingsHint({ rearDisplayId: 2, backendMode: 'lsp', lspConnected: true })).toBeNull();
        expect(rearSettingsHint({ rearDisplayId: 2, backendMode: 'lsp', lspConnected: false })).toBe('rearBridge.waiting');
        expect(rearSettingsHint({ rearDisplayId: 2, backendMode: 'shizuku' })).toBe('options.rearLyricsStartShizuku');
    });
    it('updates the settings card after an asynchronous framework handshake', () => {
        expect(rearSettingsFingerprint({ backendMode: 'lsp', lspConnected: false }))
            .not.toBe(rearSettingsFingerprint({ backendMode: 'lsp', lspConnected: true }));
    });
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

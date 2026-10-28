// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { applyPlaybackEngine, buildPlaybackTestReport, exportPlaybackTestLog, loadPlaybackTestTone, testDeadline } from '@/services/playbackEngineTest';
import { isLocalPlaybackSong } from '@/utils/appPlaybackGuards';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useAudioSettingsStore } from '@/stores/useAudioSettingsStore';
import { useAutomixSettingsStore } from '@/stores/useAutomixSettingsStore';
import { usePlaybackEngineTestStore } from '@/stores/usePlaybackEngineTestStore';
import { notePlaybackTest, readPlaybackTestLog } from '@/services/playbackTestLog';

// test/unit/services/playbackEngineTest.test.ts
const mocks = vi.hoisted(() => ({
    reset: vi.fn(), diagnostics: vi.fn(), tone: vi.fn(), share: vi.fn(), block: vi.fn(), enabled: true,
}));
vi.mock('@capacitor/core', () => ({ registerPlugin: (name: string) => name === 'TingyuPlayback'
    ? { resetForTest: mocks.reset, diagnostics: mocks.diagnostics }
    : { preparePlaybackTestTone: mocks.tone } }));
vi.mock('@/utils/playbackEngineTestBuild', () => ({ PLAYBACK_TEST_BUILD: true, PLAYBACK_TEST_SESSION_ENGINE: 'web', PLAYBACK_TEST_SELECTION_KEY: 'test_engine' }));
vi.mock('@/utils/platform', () => ({ isAndroidNativeRuntime: () => mocks.enabled }));
vi.mock('@/services/nativeAudioElement', () => ({ setNativeAudioCommandsBlocked: mocks.block }));
vi.mock('@/services/playbackFade', () => ({ playbackFade: { flush: vi.fn() } }));
vi.mock('@/services/exportDiagnosticReport', () => ({ exportDiagnosticReport: mocks.share }));
const playback = usePlaybackStore.getState(), audio = useAudioSettingsStore.getState(), mixing = useAutomixSettingsStore.getState();
beforeEach(() => {
    vi.clearAllMocks(); localStorage.clear(); mocks.enabled = true;
    mocks.reset.mockResolvedValue({ stopped: true }); mocks.diagnostics.mockResolvedValue({ model: 'test', events: [] });
    mocks.tone.mockResolvedValue({ url: 'http://127.0.0.1:12345/audio/imported-test.wav', duration: 10 });
    mocks.share.mockResolvedValue('shared');
    usePlaybackStore.setState(playback); useAudioSettingsStore.setState(audio); useAutomixSettingsStore.setState(mixing);
    document.body.innerHTML = '';
});
afterEach(() => { vi.useRealTimers(); usePlaybackStore.setState(playback); useAudioSettingsStore.setState(audio); useAutomixSettingsStore.setState(mixing); });
describe('acknowledged manual engine switching', () => {
    it('waits for native stop before persisting or reloading; pauses real media first', async () => {
        const element = document.createElement('audio'); element.pause = vi.fn(); document.body.append(element);
        let acknowledge!: (v: { stopped: boolean }) => void;
        mocks.reset.mockImplementation(() => new Promise(resolve => { acknowledge = resolve; }));
        const reload = vi.fn(); const pending = applyPlaybackEngine('media3', reload);
        expect(element.pause).toHaveBeenCalled(); expect(mocks.block).toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled(); expect(localStorage.getItem('test_engine')).toBeNull();
        acknowledge({ stopped: true }); await pending;
        expect(localStorage.getItem('test_engine')).toBe('media3'); expect(reload).toHaveBeenCalledOnce();
        expect(useAudioSettingsStore.getState().audioEqualizerSettings.enabled).toBe(false);
        expect(useAudioSettingsStore.getState().enableMediaCache).toBe(false);
        expect(useAudioSettingsStore.getState().autoPlayOnLaunch).toBe(false);
        expect(useAutomixSettingsStore.getState().automixEnabled).toBe(false);
        expect(usePlaybackStore.getState().replayGainMode).toBe('off');
    });
    it('does not apply or reload when native stop fails', async () => {
        mocks.reset.mockRejectedValue(new Error('bridge broken')); const reload = vi.fn();
        await expect(applyPlaybackEngine('web', reload)).rejects.toThrow('bridge broken');
        expect(reload).not.toHaveBeenCalled(); expect(localStorage.getItem('test_engine')).toBeNull();
    });
    it('rejects missing acknowledgment and duplicate switch attempts', async () => {
        mocks.reset.mockResolvedValue({ stopped: false });
        await expect(applyPlaybackEngine('web', vi.fn())).rejects.toThrow('acknowledged');
        mocks.reset.mockImplementation(() => new Promise(() => {})); vi.useFakeTimers();
        const first = applyPlaybackEngine('media3', vi.fn()); const rejected = expect(first).rejects.toThrow('timed out');
        await expect(applyPlaybackEngine('web', vi.fn())).rejects.toThrow('in progress');
        await vi.advanceTimersByTimeAsync(5001); await rejected;
        expect(localStorage.getItem('test_engine')).toBeNull();
    });
    it('cannot run in a non-Android environment', async () => {
        mocks.enabled = false;
        await expect(applyPlaybackEngine('media3', vi.fn())).rejects.toThrow('required');
        expect(mocks.reset).not.toHaveBeenCalled();
    });
});
describe('diagnostic export and local test source', () => {
    it('exports both native and JS causes while redacting credentials and source paths', async () => {
        notePlaybackTest('failure', { error: 'http://music.example/private/file?token=abc secret=secret123 /storage/emulated/0/private.mp3 Authorization: Bearer bearer-secret' });
        mocks.diagnostics.mockResolvedValue({ model: 'device', token: 'never-send', cause: 'https://host/private?token=abcd' });
        usePlaybackEngineTestStore.setState({ actual: 'web', reason: 'native-unavailable' });
        const content = await buildPlaybackTestReport();
        expect(content).toContain('native-unavailable'); expect(content).toContain('device');
        for (const secret of ['never-send', 'secret123', '/private/file', 'private.mp3', 'token=abcd', 'bearer-secret']) expect(content).not.toContain(secret);
        await exportPlaybackTestLog(); expect(mocks.share).toHaveBeenCalledWith(expect.stringContaining('tingyu-playback-test-v1'), '听屿播放测试日志');
    });
    it('still exports JS history when native diagnostics never answers', async () => {
        vi.useFakeTimers(); mocks.diagnostics.mockImplementation(() => new Promise(() => {}));
        const pending = buildPlaybackTestReport(); await vi.advanceTimersByTimeAsync(3001);
        const content = await pending; expect(content).toContain('unavailable'); expect(content).toContain('diagnostics-failed');
    });
    it('bounds event history and does not log per-frame events', () => {
        for (let i = 0; i < 150; i++) notePlaybackTest('state', { i });
        expect(readPlaybackTestLog()).toHaveLength(100); expect(readPlaybackTestLog().at(-1)?.details.i).toBe(149);
    });
    it('loads a local HTTP test tone without starting a second transport', async () => {
        await loadPlaybackTestTone();
        const state = usePlaybackStore.getState();
        expect(state.audioSrc).toContain('127.0.0.1:12345/audio/imported-test.wav');
        expect(state.currentSong?.sourceRef?.kind).toBe('local'); expect(isLocalPlaybackSong(state.currentSong)).toBe(true); expect(state.duration).toBe(10);
        expect(state.playerState).toBe('PAUSED'); expect(state.playQueue).toHaveLength(1);
        expect(mocks.reset).not.toHaveBeenCalled();
    });
    it('rejects unexpected remote test-tone URLs without replacing the current song', async () => {
        mocks.tone.mockResolvedValue({ url: 'https://remote.example/audio/test.wav', duration: 10 });
        const song = usePlaybackStore.getState().currentSong;
        await expect(loadPlaybackTestTone()).rejects.toThrow('Invalid test tone');
        expect(usePlaybackStore.getState().currentSong).toBe(song);
    });
    it('clears the operation deadline after success', async () => {
        vi.useFakeTimers(); expect(await testDeadline(Promise.resolve(7), 100)).toBe(7);
        expect(vi.getTimerCount()).toBe(0);
    });
});

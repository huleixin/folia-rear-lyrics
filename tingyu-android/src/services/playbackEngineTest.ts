import { getTingyuPlayback } from '../platform/tingyuPlayback';
import { PLAYBACK_TEST_BUILD, PLAYBACK_TEST_SELECTION_KEY, PLAYBACK_TEST_SESSION_ENGINE, type PlaybackTestEngine } from '../utils/playbackEngineTestBuild';
import { isAndroidNativeRuntime } from '../utils/platform';
import { usePlaybackEngineTestStore } from '../stores/usePlaybackEngineTestStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { useAutomixSettingsStore } from '../stores/useAutomixSettingsStore';
import { PlayerState, type UnifiedSong } from '../types';
import { exportDiagnosticReport } from './exportDiagnosticReport';
import { notePlaybackTest, playbackTestUriInfo, readPlaybackTestLog, redactPlaybackTestText } from './playbackTestLog';
import { blockNativeAudioCommandsForTest } from './nativeAudioElement';
import { getFoliaNative } from '../platform/foliaNative';
import { playbackFade } from './playbackFade';

// src/services/playbackEngineTest.ts
type TestPort = {
    resetForTest(): Promise<{ stopped: boolean }>;
    diagnostics(): Promise<Record<string, unknown>>;
};
const native = getTingyuPlayback<TestPort>();
const tonePort = getFoliaNative<{ preparePlaybackTestTone(): Promise<{ url: string; duration: number }> }>();
export const canUsePlaybackEngineTest = () => PLAYBACK_TEST_BUILD && isAndroidNativeRuntime();
export function testDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Test operation timed out')), ms);
        promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
}
const requireTest = () => { if (!canUsePlaybackEngineTest()) throw new Error('Playback test build required'); };
let switching = false, loadingTone = false;
function stopWebAudio() {
    playbackFade.flush();
    document.querySelectorAll('audio').forEach(audio => audio.pause());
    usePlaybackStore.getState().setPlayerState(PlayerState.PAUSED);
}
/** Stop acknowledgment is mandatory: a failed native bridge must never start a second engine. */
export async function applyPlaybackTestEngine(engine: PlaybackTestEngine, reload = () => window.location.reload()) {
    requireTest();
    if (switching || loadingTone) throw new Error('Test operation in progress');
    switching = true;
    try {
        notePlaybackTest('switch-start', { from: PLAYBACK_TEST_SESSION_ENGINE, to: engine });
        blockNativeAudioCommandsForTest();
        stopWebAudio();
        const result = await testDeadline(native.resetForTest(), 5000);
        if (result.stopped !== true) throw new Error('Native stop was not acknowledged');
        const audio = useAudioSettingsStore.getState();
        audio.handleToggleAutoPlayOnLaunch(false);
        if (engine === 'media3') {
            audio.handleSetAudioEqualizerSettings({ ...audio.audioEqualizerSettings, enabled: false });
            useAutomixSettingsStore.getState().handleToggleAutomix(false);
            usePlaybackStore.getState().setReplayGainMode('off');
            localStorage.setItem('local_replaygain_mode', 'off');
            audio.handleToggleMediaCache(false);
        }
        localStorage.setItem(PLAYBACK_TEST_SELECTION_KEY, engine);
        notePlaybackTest('switch-applied', { engine });
        reload();
    } catch (error) {
        notePlaybackTest('switch-failed', { error });
        throw error;
    } finally { switching = false; }
}
/** Load bytes only; the existing mini/stage Play control owns all transport and fade behavior. */
export async function loadPlaybackTestTone() {
    requireTest();
    if (switching || loadingTone) throw new Error('Test operation in progress');
    loadingTone = true;
    try {
        const tone = await testDeadline(tonePort.preparePlaybackTestTone(), 5000);
        const uri = new URL(tone.url);
        if (uri.protocol !== 'http:' || uri.hostname !== '127.0.0.1' || !uri.pathname.startsWith('/audio/')) throw new Error('Invalid test tone');
        stopWebAudio();
        const song: UnifiedSong = { id: 'tingyu-playback-test-tone', name: '听屿内置测试音频（10秒）',
            artists: [{ id: 'tingyu-test', name: '播放测试' }], album: { id: 'tingyu-test', name: '播放测试' },
            durationMs: 10000, isLocal: true, localRef: { songId: 'tingyu-playback-test-tone' }, sourceRef: { kind: 'local', mediaId: 'tingyu-playback-test-tone' } };
        usePlaybackStore.setState({ currentSong: song, audioSrc: tone.url, duration: 10, playerState: PlayerState.PAUSED,
            playQueue: [song], lyrics: null, cachedCoverUrl: null, isFmMode: false, activePlaybackContext: 'main', transitionDisplay: null });
        notePlaybackTest('test-tone-loaded', playbackTestUriInfo(tone.url));
    } catch (error) { notePlaybackTest('test-tone-failed', { error }); throw error; }
    finally { loadingTone = false; }
}
function safeReportValue(value: unknown): unknown {
    if (typeof value === 'string') return redactPlaybackTestText(value);
    if (Array.isArray(value)) return value.slice(-120).map(safeReportValue);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) =>
        [key, /token|cookie|authorization|password|secret|api.?key/i.test(key) ? '[redacted]' : safeReportValue(v)]));
    return value;
}
export async function buildPlaybackTestReport() {
    requireTest();
    let android: unknown;
    try { android = await testDeadline(native.diagnostics(), 3000); }
    catch (error) { android = { unavailable: redactPlaybackTestText(error) }; notePlaybackTest('diagnostics-failed', { error }); }
    const playback = usePlaybackStore.getState(), audio = useAudioSettingsStore.getState();
    const report = { format: 'tingyu-playback-test-v1', createdAt: new Date().toISOString(), sessionEngine: PLAYBACK_TEST_SESSION_ENGINE,
        selectedEngine: usePlaybackEngineTestStore.getState().selected, actualEngine: usePlaybackEngineTestStore.getState().actual, reason: usePlaybackEngineTestStore.getState().reason,
        source: { kind: playback.currentSong?.sourceRef?.kind ?? 'unknown', ...playbackTestUriInfo(playback.audioSrc ?? '') },
        state: playback.playerState, settings: { muted: audio.isMuted, volume: audio.volume, equalizer: audio.audioEqualizerSettings.enabled,
            automix: useAutomixSettingsStore.getState().automixEnabled, replayGain: playback.replayGainMode },
        media: [...document.querySelectorAll('audio')].map(element => ({ ...playbackTestUriInfo(element.getAttribute('src') ?? ''),
            position: element.currentTime, duration: element.duration, paused: element.paused, ready: element.readyState,
            muted: element.muted, volume: element.volume, error: element.error?.message ?? '', errorCode: element.error?.code ?? 0 })),
        js: readPlaybackTestLog(), android };
    return JSON.stringify(safeReportValue(report), null, 2);
}
export async function exportPlaybackTestLog() {
    return exportDiagnosticReport(await buildPlaybackTestReport(), '听屿播放测试日志');
}

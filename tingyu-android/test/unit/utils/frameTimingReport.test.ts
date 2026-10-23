// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetFrameTimingDiagnostics } from '@/utils/frameTimingDiagnostics';
import { notePlaybackStreamInfo } from '@/utils/mediaDiagnostics';
import { buildDiagnosticReport, resolveStutterAttribution } from '@/utils/buildDiagnosticReport';
import { clearCrashDiagnostics, recordCrashDiagnostic } from '@/utils/crashDiagnostics';
import { noteOnlineMutationFailure, resetOnlineMutationDiagnostics } from '@/utils/onlineMutationDiagnostics';

afterEach(async () => {
    vi.restoreAllMocks();
    resetFrameTimingDiagnostics();
    resetOnlineMutationDiagnostics();
    await clearCrashDiagnostics();
    localStorage.clear();
});

describe('diagnostic report frame timing section', () => {

    // 现场教训（0.7.15-android.64）：整体帧统计被大量平滑帧稀释成 smooth，但单帧阻塞 150ms、
    // 脚本 198ms 出在 LatticeLyrics 的 rAF 回调里 —— 归因必须被这一次翻过来，不能报 clean。
    it('flags a single heavy script frame even when the session overall looks smooth', () => {
        const at = (input: Parameters<typeof resolveStutterAttribution>[0]) => resolveStutterAttribution(input);

        expect(at({ renderHealth: 'smooth', loafHeavy: true, scriptHeavy: true, audioStalled: false }))
            .toBe('app-script');
        expect(at({ renderHealth: 'smooth', loafHeavy: true, scriptHeavy: false, audioStalled: false }))
            .toBe('ui-thread-render');
        expect(at({ renderHealth: 'heavy', loafHeavy: false, scriptHeavy: false, audioStalled: true }))
            .toBe('device-throughput');
        expect(at({ renderHealth: 'smooth', loafHeavy: false, scriptHeavy: false, audioStalled: false }))
            .toBe('clean');
        expect(at({ renderHealth: 'unknown', loafHeavy: false, scriptHeavy: false, audioStalled: false }))
            .toBe('insufficient-samples');
    });

    it('exports the frame timing evidence and its attribution', async () => {
        notePlaybackStreamInfo({
            provider: 'netease',
            requestedLevel: 'exhigh',
            resolvedLevel: 'exhigh',
            bitrateKbps: 320,
            format: 'mp3',
            host: 'm801.music.126.net',
        });
        const report = await buildDiagnosticReport();
        const lines = report.split('\n');

        expect(lines).toContain('frame timing:');
        const section = lines.slice(lines.indexOf('frame timing:'));
        const lineFor = (prefix: string): string => (
            section.find(line => line.trimStart().startsWith(prefix)) ?? ''
        );

        expect(lineFor('sampler:')).toContain('frames=');
        expect(lineFor('device:')).toMatch(/cores=.*memory=.*class=(low|mid|high|unknown)/);
        expect(lineFor('frame time:')).toContain('p95=');
        expect(lineFor('dropped frames:')).toContain('jank>50ms=');
        expect(lineFor('long tasks')).toContain('count=');
        expect(lineFor('cpu probe:')).toContain('index=');
        expect(lineFor('render health:')).toMatch(/smooth|mild|heavy|unknown/);
        expect(lineFor('attribution:')).toContain('cpu=');

        // 「歌卡」排查需要的音频侧证据：解析到的流、播放中被改过位置/速率、解码进度。
        const continuity = lines.slice(lines.indexOf('playback continuity:'), lines.indexOf('frame timing:'));
        const continuityLine = (prefix: string) => continuity.find(line => line.trimStart().startsWith(prefix)) ?? '';
        expect(continuityLine('stream:')).toContain('level=');
        expect(continuityLine('element events:')).toContain('seeking=');
        expect(continuityLine('decode:')).toContain('bytes=');
        expect(continuityLine('audio clock:')).toContain('progress=');
    });

    // 本地音频代理在播放器断开时抛的 SocketException 是预期收尾，不是崩溃。以前它们会占满
    // 崩溃列表的 20 条、把真正的退出原因挤掉；现在单独归一行摘要。
    it('keeps expected audio-server teardown out of the crash list', async () => {
        recordCrashDiagnostic('local-audio-server', new Error('Broken pipe'), { message: 'Broken pipe' });
        recordCrashDiagnostic('local-audio-server', new Error('Connection reset'), { message: 'Connection reset' });
        recordCrashDiagnostic('webview', new Error('renderer gone'), {
            type: 'webview-renderer-gone',
            thread: 'webview',
            message: 'renderer gone',
        });

        const lines = (await buildDiagnosticReport()).split('\n');
        const section = lines.slice(lines.indexOf('crash diagnostics:'));

        // 真正的崩溃仍然在列表里，而且不会被两条 pipe 噪声顶掉编号。
        expect(section.some(line => line.includes('[1]') && line.includes('source=webview'))).toBe(true);
        expect(section.some(line => line.includes('source=local-audio-server') && line.startsWith('  ['))).toBe(false);
        expect(section.some(line => line.startsWith('  local audio server teardown: 2'))).toBe(true);
    });

    // 现场「收藏失败」在诊断里查不到原因：provider 缺标识时提前拒绝，一个请求都不发。
    it('surfaces online mutation failures with provider, operation and reason', async () => {
        noteOnlineMutationFailure({
            providerId: 'qq',
            operation: 'song-like',
            mediaId: 'qq:002SiJyq1mesDt',
            error: new Error('QQ song has no songmid for a like write'),
        });

        const lines = (await buildDiagnosticReport()).split('\n');
        expect(lines).toContain('online mutation trace:');
        const section = lines.slice(lines.indexOf('online mutation trace:'));
        expect(section.some(line => line.includes('provider=qq'))).toBe(true);
        expect(section.some(line => line.includes('operation=song-like'))).toBe(true);
        expect(section.some(line => line.includes('mediaId=qq:002SiJyq1mesDt'))).toBe(true);
        expect(section.some(line => line.includes('no songmid'))).toBe(true);
    });
});

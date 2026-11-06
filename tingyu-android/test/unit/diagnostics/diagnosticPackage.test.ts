import { describe, expect, it } from 'vitest';
import {
    collectDiagnosticMetadata,
    collectDiagnosticPerformance,
    formatFeedbackText,
    scrubReportForPackage,
} from '../../../src/services/diagnostics/diagnosticPackage';

// test/unit/diagnostics/diagnosticPackage.test.ts
// 诊断包分片的契约：metadata 结构稳定、performance 是合法 JSON、feedback 文本能自证内容。
// 这里不跑 buildDiagnosticReport（那会遍历 30+ 模块，属于导出时的一次性开销）。

describe('diagnosticPackage', () => {
    it('metadata 带齐 schema / 版本 / 隐私边界', async () => {
        const metadata = await collectDiagnosticMetadata();
        expect(metadata.schema).toBe('tingyu-diagnostic/1');
        const app = metadata.app as Record<string, unknown>;
        expect(typeof app.versionName).toBe('string');
        expect(app.packageName).toBe('io.github.huleixin.tingyu');
        const privacy = metadata.privacy as { excluded: string[] };
        expect(privacy.excluded.join('|')).toContain('Token');
        expect(privacy.excluded.join('|')).toContain('完整歌词');
    });

    it('performance 是合法 JSON，且包含帧率摘要', () => {
        const raw = collectDiagnosticPerformance();
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        expect(parsed).toHaveProperty('frameTiming');
        expect(parsed).toHaveProperty('generatedAt');
        expect(String(parsed.note)).toContain('FrameMetrics');
    });

    it('feedback 文本包含类别与描述', () => {
        const text = formatFeedbackText({
            category: 'playback',
            description: '播放到 1:20 停住',
            includeDiagnostics: true,
            screenshots: ['data:image/jpeg;base64,AAA'],
        });
        expect(text).toContain('类别：playback');
        expect(text).toContain('播放到 1:20 停住');
        expect(text).toContain('附带诊断日志：是');
    });

    it('没有描述时给出占位而不是空白', () => {
        const text = formatFeedbackText({
            category: 'other',
            description: '   ',
            includeDiagnostics: false,
            screenshots: [],
        });
        expect(text).toContain('(用户没有填写描述)');
        expect(text).toContain('附带诊断日志：否');
    });

    it('进包前抹掉账号尾号与签名参数', () => {
        const scrubbed = scrubReportForPackage(
            'loggedIn=true uinTail=…7053 nickname=present(len=6) https://example.com/a?token=abc&x=1',
        );
        expect(scrubbed).not.toContain('7053');
        expect(scrubbed).toContain('uinTail=redacted');
        expect(scrubbed).not.toContain('token=abc');
        expect(scrubbed).toContain('token=redacted');
    });
});

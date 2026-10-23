import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    buildDiagnosticFileName,
    canDeleteExportedDiagnostics,
    deleteExportedDiagnostics,
    exportDiagnosticReport,
} from '@/services/exportDiagnosticReport';

// test/unit/services/exportDiagnosticReport.test.ts
// 「导出诊断数据」：安卓写 txt 后走原生分享；其它运行时优先 Web Share，再退回下载。

const shareTextFile = vi.fn(async () => ({}));
const share = vi.fn(async () => undefined);
const canShare = vi.fn(() => true);

class FakeFile {
    readonly type = 'text/plain';

    constructor(
        public readonly parts: unknown[],
        public readonly name: string,
        public readonly options?: unknown,
    ) {}
}

const stubAndroidPlugin = () => {
    vi.stubGlobal('window', { Capacitor: { Plugins: { FoliaNative: { shareTextFile } } } });
};

const stubWebShare = (options: { canShareFiles: boolean; rejectWith?: Error }) => {
    const shareImpl = options.rejectWith
        ? vi.fn(async () => { throw options.rejectWith; })
        : share;
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { share: shareImpl, canShare: () => options.canShareFiles });
    vi.stubGlobal('File', FakeFile);
    return shareImpl;
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    shareTextFile.mockClear();
    share.mockClear();
    canShare.mockClear();
});

describe('diagnostic export file name', () => {
    it('stamps the local time so repeated exports stay distinct', () => {
        expect(buildDiagnosticFileName(new Date(2026, 9, 13, 19, 5, 3)))
            .toBe('folia-diagnostics-20261013-190503.txt');
    });
});

describe('diagnostic export target', () => {
    it('prefers the native share bridge on Android', async () => {
        stubAndroidPlugin();

        const result = await exportDiagnosticReport('report body', '导出诊断数据');

        expect(result).toBe('shared');
        expect(shareTextFile).toHaveBeenCalledWith({
            filename: expect.stringMatching(/^folia-diagnostics-\d{8}-\d{6}\.txt$/),
            content: 'report body',
            title: '导出诊断数据',
        });
        expect(share).not.toHaveBeenCalled();
    });

    it('falls back to the Web Share API when there is no native plugin', async () => {
        const shareImpl = stubWebShare({ canShareFiles: true });

        const result = await exportDiagnosticReport('report body', 'Export diagnostics');

        expect(result).toBe('shared');
        expect(shareImpl).toHaveBeenCalledTimes(1);
        const payload = ((shareImpl.mock.calls as unknown[][])[0] as unknown[])[0] as {
            files: FakeFile[];
            title: string;
        };
        expect(payload.title).toBe('Export diagnostics');
        expect(payload.files[0].name).toMatch(/^folia-diagnostics-\d{8}-\d{6}\.txt$/);
        expect(payload.files[0].parts).toEqual(['report body']);
    });

    it('treats a cancelled share sheet as cancelled instead of failed', async () => {
        const abort = new Error('cancelled');
        abort.name = 'AbortError';
        stubWebShare({ canShareFiles: true, rejectWith: abort });

        await expect(exportDiagnosticReport('report body', 'Export diagnostics'))
            .resolves.toBe('cancelled');
    });
});

describe('diagnostic deletion', () => {
    it('is unavailable without the native plugin', async () => {
        vi.stubGlobal('window', {});

        expect(canDeleteExportedDiagnostics()).toBe(false);
        await expect(deleteExportedDiagnostics()).resolves.toBe(0);
    });

    it('reports how many exported files the native side removed', async () => {
        const deleteDiagnosticFiles = vi.fn(async () => ({ deleted: 3 }));
        vi.stubGlobal('window', {
            Capacitor: { Plugins: { FoliaNative: { deleteDiagnosticFiles } } },
        });

        expect(canDeleteExportedDiagnostics()).toBe(true);
        await expect(deleteExportedDiagnostics()).resolves.toBe(3);
        expect(deleteDiagnosticFiles).toHaveBeenCalledTimes(1);
    });
});

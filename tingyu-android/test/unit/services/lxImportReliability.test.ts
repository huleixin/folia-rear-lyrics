// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    isNative: true,
    lxHttp: vi.fn(),
    validateLxScript: vi.fn(),
    cancelLxValidation: vi.fn(async () => {}),
    pickLxSourceFile: vi.fn(),
    activateLxSource: vi.fn(),
    workerShouldFail: false,
    workerDelayMs: 0,
}));

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => mocks.isNative },
}));
vi.mock('@/platform/tingyuPlayback', () => ({
    getTingyuPlayback: () => ({ validateLxScript: mocks.validateLxScript, cancelLxValidation: mocks.cancelLxValidation }),
}));
vi.mock('@/platform/foliaNative', () => ({
    getFoliaNative: () => ({ pickLxSourceFile: mocks.pickLxSourceFile }),
}));
vi.mock('@/utils/platform', () => ({
    isAndroidNativeRuntime: () => mocks.isNative,
}));
vi.mock('@/services/lxSource/http', () => ({
    lxHttp: mocks.lxHttp,
}));
vi.mock('@/services/onlineMusic/omni', () => ({
    omni: { activateLxSource: mocks.activateLxSource },
}));
vi.mock('@/services/lxSource/client', () => ({
    LxRuntime: class MockLxRuntime {
        readonly ready: Promise<Record<string, { name: string; qualitys: string[]; actions: string[] }>>;
        updateAlert = null;
        private rejectReady!: (error: Error) => void;
        constructor() {
            this.ready = new Promise((resolve, reject) => {
                this.rejectReady = reject;
                setTimeout(() => {
                    if (mocks.workerShouldFail) reject(new Error('Worker init failed'));
                    else resolve({ tx: { name: 'QQ音乐', qualitys: ['128k'], actions: ['musicUrl'] } });
                }, mocks.workerDelayMs);
            });
        }
        stop(error = new Error('stopped')) {
            this.rejectReady(error);
        }
    },
}));

import { installLxSource, isLxAbortError, type LxImportStage } from '@/services/lxSource/installation';
import { checkLxScript, loadLxScriptUrl } from '@/services/lxSource/management';
import { pickLxScript } from '@/services/lxSource/importFile';
import { useLxSourceStore } from '@/stores/useLxSourceStore';

const VALID_CODE = '/**\n * @name Reliable Source\n * @version 1.0.0\n */\nconsole.log("ok");';

const confirmRisk = () => {
    useLxSourceStore.getState().setConsentChecked(true);
    useLxSourceStore.getState().confirmConsent();
};

describe('LxSource import reliability & progress stages', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        mocks.isNative = true;
        mocks.workerShouldFail = false;
        mocks.workerDelayMs = 0;
        mocks.validateLxScript.mockResolvedValue({ valid: true, reason: '' });
        useLxSourceStore.getState().close();
        useLxSourceStore.setState({
            extensionEnabled: true,
            riskAccepted: true,
            scripts: [],
            activeId: null,
            consent: null,
        });
    });

    it('reports granular stages for local file import and preserves existing sources on abort', async () => {
        const existing = {
            id: 'existing-1',
            name: 'Existing',
            version: '1.0',
            description: '',
            author: '',
            homepage: '',
            code: VALID_CODE,
            capabilities: { tx: { name: 'QQ', qualitys: ['128k' as const] } },
        };
        useLxSourceStore.setState({ scripts: [existing], activeId: 'existing-1' });

        const stages: LxImportStage[] = [];
        const controller = new AbortController();
        mocks.pickLxSourceFile.mockImplementation(() => new Promise(() => {}));

        const task = installLxSource(
            () => pickLxScript({ signal: controller.signal }),
            true,
            { sourceKind: 'file', signal: controller.signal, onStage: stage => stages.push(stage) },
        );
        confirmRisk();
        await vi.waitFor(() => expect(stages).toContain('picking'));
        controller.abort();

        await expect(task).rejects.toSatisfy(isLxAbortError);
        expect(stages).toEqual(['consent', 'picking']);
        expect(useLxSourceStore.getState().scripts).toHaveLength(1);
        expect(useLxSourceStore.getState().activeId).toBe('existing-1');
        expect(mocks.activateLxSource).not.toHaveBeenCalled();
    });

    it('reports granular stages for URL import and installs on success', async () => {
        const stages: LxImportStage[] = [];
        mocks.lxHttp.mockResolvedValue({ statusCode: 200, headers: {}, body: VALID_CODE });
        const controller = new AbortController();

        const task = installLxSource(
            () => loadLxScriptUrl('https://example.com/source.js', controller.signal),
            true,
            { sourceKind: 'url', signal: controller.signal, onStage: stage => stages.push(stage) },
        );
        confirmRisk();
        const result = await task;

        expect(result?.capabilities.tx).toBeDefined();
        expect(stages).toEqual(['consent', 'downloading', 'validating', 'saving']);
        expect(useLxSourceStore.getState().scripts).toHaveLength(1);
        expect(mocks.activateLxSource).toHaveBeenCalledOnce();
    });

    it('rejects HTML responses, HTTP errors, and invalid URLs without crashing', async () => {
        await expect(loadLxScriptUrl('http://127.0.0.1/test.js')).rejects.toThrow('公网');

        mocks.lxHttp.mockResolvedValueOnce({ statusCode: 404, headers: {}, body: 'Not Found' });
        await expect(loadLxScriptUrl('https://example.com/missing.js')).rejects.toThrow('HTTP 404');

        mocks.lxHttp.mockResolvedValueOnce({ statusCode: 200, headers: {}, body: '<!DOCTYPE html><html><body>Login</body></html>' });
        await expect(loadLxScriptUrl('https://example.com/page.html')).rejects.toThrow('网页内容');
    });

    it('runs worker and native validation in parallel and rejects when native QuickJS fails', async () => {
        mocks.validateLxScript.mockResolvedValueOnce({ valid: false, reason: 'SyntaxError: unexpected token' });
        const permitTask = useLxSourceStore.getState().requestImport();
        confirmRisk();
        const permit = await permitTask;
        expect(permit).not.toBeNull();

        await expect(
            checkLxScript(
                { id: 's1', name: 'Broken', version: '1.0', description: '', author: '', homepage: '', code: VALID_CODE },
                permit!,
            ),
        ).rejects.toThrow('原生 JS 初始化失败');
        expect(useLxSourceStore.getState().scripts).toHaveLength(0);
    });

    it('cancels native initialization and preserves the installed source when the user cancels', async () => {
        mocks.validateLxScript.mockImplementationOnce(() => new Promise(() => {}));
        const permitTask=useLxSourceStore.getState().requestImport();confirmRisk();
        const permit=await permitTask,controller=new AbortController();
        const task=checkLxScript({id:'candidate',name:'Candidate',version:'1',description:'',author:'',homepage:'',code:VALID_CODE},permit!,{signal:controller.signal});
        const rejected=expect(task).rejects.toSatisfy(isLxAbortError);
        await vi.waitFor(()=>expect(mocks.validateLxScript).toHaveBeenCalledOnce());
        const request=mocks.validateLxScript.mock.calls[0][0];
        expect(request.timeoutMs).toBe(60000);
        controller.abort();await rejected;
        expect(mocks.cancelLxValidation).toHaveBeenCalledWith({requestId:request.requestId});
        expect(useLxSourceStore.getState().scripts).toHaveLength(0);
        expect(mocks.activateLxSource).not.toHaveBeenCalled();
    });
});

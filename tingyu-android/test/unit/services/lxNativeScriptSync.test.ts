import { describe, expect, it, vi, beforeEach } from 'vitest';

// 洛雪音源原生化的 JS 侧：把用户启用的**脚本本身**交给播放进程。
// 这里只验证交出去的是什么、以及什么时候交，不验证原生怎么执行它（那是 JVM 侧的责任）。

interface ScriptPayload {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    homepage: string;
    code: string;
}

const scriptCalls: ScriptPayload[] = [];
const setLxScript = vi.fn(async (payload: ScriptPayload) => {
    scriptCalls.push(payload);
    return { installed: payload.code.length > 0 };
});

const lastScript = (): ScriptPayload => {
    const payload = scriptCalls[scriptCalls.length - 1];
    if (!payload) throw new Error('no script was handed over');
    return payload;
};

vi.mock('../../../src/platform/tingyuPlayback', () => ({
    getTingyuPlayback: () => ({ setLxScript }),
}));

const { useLxSourceStore } = await import('../../../src/stores/useLxSourceStore');
const { syncLxScriptToNative, resetLxScriptSyncForTest, readLxNativeSyncState } = await import(
    '../../../src/services/lxNativeScriptSync'
);

const script = (id: string, name: string, code: string) => ({
    id,
    name,
    version: '1.0.0',
    description: '',
    author: '',
    homepage: '',
    code,
    capabilities: { tx: { name: 'QQ音乐', qualitys: ['128k', '320k'] } },
});

describe('lxNativeScriptSync', () => {
    beforeEach(() => {
        // mockReset 而不是 mockClear：前一个用例的 mockRejectedValueOnce 会残留，
        // 把本该成功的下发变成失败，测出来的"同步状态"就是假的。
        setLxScript.mockReset();
        setLxScript.mockImplementation(async (payload: ScriptPayload) => {
            scriptCalls.push(payload);
            return { installed: payload.code.length > 0 };
        });
        scriptCalls.length = 0;
        resetLxScriptSyncForTest();
        useLxSourceStore.setState({ scripts: [], activeId: null });
    });

    it('hands the active script to native', async () => {
        useLxSourceStore.setState({ scripts: [script('a', '源A', 'code-a')], activeId: 'a' });
        await syncLxScriptToNative();
        expect(lastScript().code).toBe('code-a');
        expect(lastScript().name).toBe('源A');
    });

    it('does not resend an unchanged script', async () => {
        useLxSourceStore.setState({ scripts: [script('a', '源A', 'code-a')], activeId: 'a' });
        await syncLxScriptToNative();
        await syncLxScriptToNative();
        expect(scriptCalls).toHaveLength(1);
    });

    it('sends the new code when the user switches scripts', async () => {
        useLxSourceStore.setState({
            scripts: [script('a', '源A', 'code-a'), script('b', '源B', 'code-b')],
            activeId: 'a',
        });
        await syncLxScriptToNative();
        useLxSourceStore.setState({ activeId: 'b' });
        await syncLxScriptToNative();
        expect(scriptCalls).toHaveLength(2);
        expect(lastScript().code).toBe('code-b');
    });

    it('clears native when no script is active', async () => {
        useLxSourceStore.setState({ scripts: [script('a', '源A', 'code-a')], activeId: 'a' });
        await syncLxScriptToNative();
        useLxSourceStore.setState({ activeId: null });
        await syncLxScriptToNative();
        expect(lastScript().code).toBe('');
    });

    it('follows store changes without waiting for the next playback', async () => {
        useLxSourceStore.setState({ scripts: [script('a', '源A', 'code-a')], activeId: 'a' });
        await syncLxScriptToNative();
        // 用户在设置里换脚本：store 变化本身就应该触发同步，不等下一次播放。
        useLxSourceStore.setState({ scripts: [script('c', '源C', 'code-c')], activeId: 'c' });
        // 订阅回调里是 void 调用，等到下一次宏任务再断言。
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(scriptCalls.length).toBeGreaterThan(1);
        expect(lastScript().code).toBe('code-c');
    });

    it('never throws when the bridge is unavailable', async () => {
        useLxSourceStore.setState({ scripts: [script('a', '源A', 'code-a')], activeId: 'a' });
        setLxScript.mockRejectedValueOnce(new Error('bridge down'));
        await expect(syncLxScriptToNative()).resolves.toBeUndefined();
    });

    // 真机 1.3.48 的教训：插件方法存在、APK 里有 libquickjs.so，都不等于脚本真的
    // 交到了播放进程。同步结果必须可查，失败不能被静默吞掉。
    it('records whether the script actually reached the playback process', async () => {
        // 只走 store 订阅那条路径：显式调用会因为签名相同而提前返回，
        // 读到的就是上一次的状态，测出来的结论是假的。
        useLxSourceStore.setState({ scripts: [script('a', '源A', 'code-a')], activeId: 'a' });
        await new Promise(resolve => setTimeout(resolve, 0));
        const state = readLxNativeSyncState();
        expect(state.installed).toBe(true);
        expect(state.error).toBeNull();
    });

    it('records a failure instead of silently assuming native can run the script', async () => {
        setLxScript.mockRejectedValueOnce(new Error('bridge down'));
        useLxSourceStore.setState({ scripts: [script('z', '源Z', 'code-z')], activeId: 'z' });
        await new Promise(resolve => setTimeout(resolve, 0));
        const state = readLxNativeSyncState();
        expect(state.installed).toBe(false);
        expect(state.error).toBe('Error');
    });
});

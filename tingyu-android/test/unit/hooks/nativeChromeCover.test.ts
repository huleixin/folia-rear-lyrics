// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';
import { useNativeChromeCover } from '@/hooks/useNativeChromeCover';

// test/unit/hooks/nativeChromeCover.test.ts
// 冷启动迷你播放器封面专项：真机 Compose 版只能读 data: / 带 host 的 http(s)。
// 这组用例覆盖「相对路径必须被转换」「初始化主动解析」「异步完成后自动更新」
// 「旧请求不串到新歌」「失败后的事件驱动重试」「在线封面不受影响」。

const resolver = vi.hoisted(() => ({
    calls: [] as string[],
    pending: {} as Record<string, (value: string) => void>,
    compose: { enabled: true },
}));

vi.mock('@/services/nativeChrome', () => ({
    get COMPOSE_CHROME() { return resolver.compose.enabled; },
}));
vi.mock('@/services/nativeCoverThumbnail', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/services/nativeCoverThumbnail')>();
    return {
        ...actual,
        nativeCoverThumbnail: (url: string) => {
            resolver.calls.push(url);
            return new Promise<string>(resolve => { resolver.pending[url] = resolve; });
        },
    };
});

const LOCAL = '/__folia_cover/sha256:abc?size=1024';
const SECOND = '/__folia_cover/sha256:def?size=1024';
const DATA = 'data:image/jpeg;base64,AAA';

type Props = { url: string | null; active: boolean };

const mount = async (initial: Props) => {
    let model = '';
    const root = createRoot(document.createElement('div'));
    const Probe = (props: Props) => {
        model = useNativeChromeCover(props.url, props.active);
        return null;
    };
    await act(async () => { root.render(h(Probe, initial)); });
    return {
        get value() { return model; },
        render: async (next: Props) => { await act(async () => { root.render(h(Probe, next)); }); },
        unmount: async () => { await act(async () => { root.unmount(); }); },
    };
};

beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    resolver.calls.length = 0;
    resolver.pending = {};
    resolver.compose.enabled = true;
});

it('冷启动首帧允许占位，但初始化即主动解析本地封面，完成后自动更新', async () => {
    const probe = await mount({ url: LOCAL, active: true });
    expect(probe.value).toBe('');                 // 解析完成前是占位图
    expect(resolver.calls).toContain(LOCAL);      // 没有等切歌 / 点击播放 / 固定延迟
    await act(async () => { resolver.pending[LOCAL]?.(DATA); });
    expect(probe.value).toBe(DATA);               // setState → chrome 重推一帧
    await probe.unmount();
});

it('在线 CDN 与已是 data: 的封面原样交给原生，不触发解析', async () => {
    const online = 'https://cdn.example.com/cover.jpg';
    const a = await mount({ url: online, active: true });
    expect(a.value).toBe(online);
    expect(resolver.calls).toHaveLength(0);
    await a.unmount();

    const b = await mount({ url: DATA, active: true });
    expect(b.value).toBe(DATA);
    expect(resolver.calls).toHaveLength(0);
    await b.unmount();
});

it('旧封面的异步结果不会贴到新歌上', async () => {
    const probe = await mount({ url: LOCAL, active: true });
    await probe.render({ url: SECOND, active: true });
    expect(probe.value).toBe('');
    await act(async () => { resolver.pending[LOCAL]?.('data:image/jpeg;base64,OLD'); });
    expect(probe.value).toBe('');
    await act(async () => { resolver.pending[SECOND]?.('data:image/jpeg;base64,NEW'); });
    expect(probe.value).toBe('data:image/jpeg;base64,NEW');
    await probe.unmount();
});

it('解析失败时保持占位图；封面资产就绪事件后有界重试并出图', async () => {
    const probe = await mount({ url: LOCAL, active: true });
    await act(async () => { resolver.pending[LOCAL]?.(''); });   // 失败：不通知任何订阅者
    expect(probe.value).toBe('');
    expect(resolver.calls).toHaveLength(1);

    await act(async () => { window.dispatchEvent(new Event('folia-local-music-updated')); });
    expect(resolver.calls.length).toBeGreaterThanOrEqual(2);
    await act(async () => { resolver.pending[LOCAL]?.(DATA); });
    expect(probe.value).toBe(DATA);
    await probe.unmount();
});

it('Service Worker 认领页面事件触发一次重试，不依赖固定延迟', async () => {
    const worker = new EventTarget();
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: worker });
    try {
        const probe = await mount({ url: LOCAL, active: true });
        expect(resolver.calls).toHaveLength(1);
        await act(async () => { worker.dispatchEvent(new Event('controllerchange')); });
        expect(resolver.calls.length).toBeGreaterThanOrEqual(2);
        await probe.unmount();
    } finally {
        Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined });
    }
});

it('WebView DOM 版仍直接使用 Web 地址，不受原生转换影响', async () => {
    resolver.compose.enabled = false;
    const probe = await mount({ url: LOCAL, active: true });
    expect(probe.value).toBe(LOCAL);
    expect(resolver.calls).toHaveLength(0);
    await probe.unmount();
});

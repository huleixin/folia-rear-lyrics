// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// test/unit/localLibrary/nativePlayerArtwork.test.ts
// 专项修复：本地封面在列表/迷你条可见，完整播放页与通知却是默认音符。
// 验证统一解析入口对 WebView 专用地址的判定与 data: 转换（不依赖真实图片解码）。

import {
    isWebManagedArtworkUrl,
    peekNativePlayerArtwork,
    prewarmNativePlayerArtwork,
    resolveNativePlayerArtwork,
} from '../../../src/services/nativeCoverThumbnail';

const DATA_URL = 'data:image/jpeg;base64,AAAA';

describe('播放器封面统一解析入口', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: () => ({ drawImage: () => {} }),
        });
        Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
            configurable: true,
            value: () => DATA_URL,
        });
        vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ close: () => {} })));
        vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['cover']) })));
    });

    it('只把 WebView 专用地址识别为需要转换的封面', () => {
        expect(isWebManagedArtworkUrl('blob:http://localhost/abc')).toBe(true);
        expect(isWebManagedArtworkUrl('/__folia_cover/asset123?size=512')).toBe(true);
        expect(isWebManagedArtworkUrl('folia-cover://asset/asset123')).toBe(true);
        expect(isWebManagedArtworkUrl('https://cdn.example.com/cover.jpg')).toBe(false);
        expect(isWebManagedArtworkUrl('')).toBe(false);
        expect(isWebManagedArtworkUrl(undefined)).toBe(false);
    });

    it('在线 CDN 封面原样返回，不触发任何解析', () => {
        const url = 'https://cdn.example.com/cover.jpg';
        expect(resolveNativePlayerArtwork(url)).toBe(url);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('本地封面解析后产出的 data: 被缓存，可同步读取给原生', async () => {
        const url = '/__folia_cover/asset-unique-1?size=1024';
        // 首次同步调用尚未解析完：先返回原地址，WebView 侧仍可用。
        const first = resolveNativePlayerArtwork(url);
        expect(first).toBe(url);
        const resolved = await prewarmNativePlayerArtwork(url);
        expect(resolved).toBe(DATA_URL);
        expect(peekNativePlayerArtwork(url)).toBe(DATA_URL);
        // 解析完成后，所有交给原生的地方拿到的都是同一张图。
        expect(resolveNativePlayerArtwork(url)).toBe(DATA_URL);
    });

    it('解析失败时保留原地址，不让封面变成空白或残留上一首', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('service-worker-not-ready'); }));
        const url = '/__folia_cover/asset-failing';
        const resolved = await prewarmNativePlayerArtwork(url);
        expect(resolved).toBe('');
        expect(peekNativePlayerArtwork(url)).toBe('');
        expect(resolveNativePlayerArtwork(url)).toBe(url);
    });
});

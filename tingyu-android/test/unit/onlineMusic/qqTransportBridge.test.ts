import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
    configured: vi.fn(),
    request: vi.fn(),
}));

vi.mock('@/services/foliaExtensionBridge', () => ({
    isFoliaExtensionBridgeConfigured: bridge.configured,
    isFoliaExtensionBridgeAvailable: vi.fn().mockResolvedValue(true),
    requestFoliaExtension: bridge.request,
}));

import { requestQq } from '@/services/onlineMusic/qqTransport';

// test/unit/onlineMusic/qqTransportBridge.test.ts
//
// 内置桥这条路径（VITE_QQ_API_BASE=extension）此前把方法硬编码成 GET、也不转发正文，
// 写入类操作（user_song_like / user_album_subscribe / user_playlist_tracks / user_playlist_subscribe）
// 到了桥里只有空 params，被判成 bad input，界面看到的是「操作失败」。这里钉住方法跟着
// POST_OPERATIONS 走、正文随请求一起交给桥。

const ORIGINAL_BASE = process.env.VITE_QQ_API_BASE;

beforeEach(() => {
    process.env.VITE_QQ_API_BASE = 'extension';
    bridge.configured.mockReturnValue(true);
    bridge.request.mockReset();
    bridge.request.mockResolvedValue({ code: 0 });
});

afterEach(() => {
    if (ORIGINAL_BASE === undefined) delete process.env.VITE_QQ_API_BASE;
    else process.env.VITE_QQ_API_BASE = ORIGINAL_BASE;
    vi.unstubAllGlobals();
});

describe('QQ transport through the embedded bridge', () => {
    it('sends a write operation as POST with its payload as the body', async () => {
        const payload = { song: { id: 101, mid: 'song-mid', type: 0 }, liked: true };
        bridge.request.mockResolvedValue({ code: 0, liked: true });

        await requestQq('user_song_like', {}, payload);

        expect(bridge.request).toHaveBeenCalledTimes(1);
        const request = bridge.request.mock.calls[0][0];
        expect(request.operation).toBe('user_song_like');
        expect(request.method).toBe('POST');
        expect(request.body).toEqual(payload);
    });

    it('sends an album subscription write as POST with its payload', async () => {
        const payload = { id: '000FixAlbum001', subscribed: false };
        bridge.request.mockResolvedValue({ code: 0, subscribed: false });

        await requestQq('user_album_subscribe', {}, payload);

        const request = bridge.request.mock.calls[0][0];
        expect(request.method).toBe('POST');
        expect(request.body).toEqual(payload);
    });

    it('keeps read operations on GET and sends no body', async () => {
        bridge.request.mockResolvedValue({ code: 0, songs: [] });

        await requestQq('user_guess_you_like');

        const request = bridge.request.mock.calls[0][0];
        expect(request.operation).toBe('user_guess_you_like');
        expect(request.method).toBe('GET');
        expect(request.body).toBeUndefined();
    });

    // 桥回 __foliaBridgeError 时按既有约定翻成 OnlineProviderError，不把错误体当成功返回。
    it('translates a bridge error into a provider error', async () => {
        bridge.request.mockResolvedValue({ __foliaBridgeError: 'UNSUPPORTED', message: 'no route' });

        await expect(requestQq('user_guess_you_like')).rejects.toMatchObject({
            code: 'unsupported',
            message: 'no route',
        });
    });
});

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Exercise the actual Android bridge. QR failures must identify their stage without logging credentials.
beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); });
it('retries a transient QR network failure once and returns a usable image', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('connection reset'))
        .mockResolvedValueOnce(Response.json({ data: { token: 'fixture', qrcode: 'aW1hZ2U=' } }));
    vi.stubGlobal('fetch', fetch);
    const { handleQishuiRequest } = await import('@/nativeBridge/api/qishui.js');
    const result = await handleQishuiRequest('login_qr_key', {});
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    if (result.ok) expect(await handleQishuiRequest('login_qr_create', { key: result.data.key }))
        .toMatchObject({ ok: true, data: { imageUrl: 'data:image/png;base64,aW1hZ2U=' } });
});
it('labels a malformed response and does not retry an upstream rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ data: {} })));
    const { handleQishuiRequest } = await import('@/nativeBridge/api/qishui.js');
    expect(await handleQishuiRequest('login_qr_key', {})).toMatchObject({ ok: false, error: { code: 'invalid-response', stage: 'qr-code' } });
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ data: { error_code: 10007 } }));
    expect(await handleQishuiRequest('login_qr_key', {})).toMatchObject({ ok: false, error: { code: 'auth-required', stage: 'qr-code', upstreamCode: '10007' } });
    expect(fetch).toHaveBeenCalledTimes(2);
});

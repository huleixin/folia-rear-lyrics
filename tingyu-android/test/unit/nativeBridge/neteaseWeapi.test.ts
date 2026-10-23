import { describe, expect, it } from 'vitest';
import { weapiEncrypt } from '@/nativeBridge/api/weapi.js';

// test/unit/nativeBridge/neteaseWeapi.test.ts
//
// 回归现场：`RSA_MODULUS` 曾是一个被写坏的常量（从第 9 个字符起就与标准值分岔，约 460 位十六进制），
// 算出来的 `encSecKey` 有 413 位；NetEase 解不开参数 → **一律回 HTTP 200 + 空体**，
// 而 weapiRequest 对空体返回 {}，于是所有 weapi 调用（收藏、收藏检查、收藏列表）静默失效，
// 界面却可能显示成功。修正后本机实测同一请求从空体变成正常 JSON，encSecKey 恢复 256 位。

describe('NetEase weapi encryption', () => {
    it('produces a 256-hex encSecKey (1024-bit modulus)', () => {
        const { encSecKey, params } = weapiEncrypt({ ids: 'x' });
        expect(encSecKey).toMatch(/^[0-9a-f]{256}$/);
        expect(params.length).toBeGreaterThan(0);
    });

    it('uses a fresh random secret key per call', () => {
        const first = weapiEncrypt({ a: 1 });
        const second = weapiEncrypt({ a: 1 });
        expect(first.params).not.toBe(second.params);
        expect(first.encSecKey).not.toBe(second.encSecKey);
    });
});

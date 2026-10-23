import { describe, expect, it } from 'vitest';

// test/unit/nativeBridge/qqRadioComm.test.ts
//
// 私人 FM 的请求形状出过三次问题（网页 comm、缺 tmeLoginType、缺设备身份与 Cookie 形态），
// 这里把对齐参考实现后的形状钉住，避免以后又漂回去。

const COOKIE = [
    'uin=o002774749',
    'qqmusic_uin=o002774749',
    'str_musicid=3379082',
    'qm_keyst=MUSICKEY',
    'qqmusic_key=MUSICKEY',
    'login_type=1',
].join('; ');

const DEVICE = {
    openUdid: 'a'.repeat(32),
    androidId: 'b'.repeat(16),
    imei: '123456789012345',
    model: 'MI 6',
    brand: 'Xiaomi',
    osRelease: '10',
    sdk: 29,
    fingerprint: 'xiaomi/iarim/sagit:10/eomam.200122.001/1234567:user/release-keys',
    procVersion: 'Linux 5.4.0-54-generic-deadbeef (android-build@google.com)',
};

describe('QQ radio comm', () => {
    it('carries the android client fields the reference sends', async () => {
        const { buildQQRadioComm } = await import('@/nativeBridge/api/qq.js');
        const comm = buildQQRadioComm(COOKIE, DEVICE);

        expect(comm.ct).toBe(11);
        expect(comm.cv).toBe(14090008);
        expect(comm.v).toBe(14090008);
        expect(comm.chid).toBe('10003505');
        expect(comm.tmeAppID).toBe('qqmusic');
        // 音乐账号 id，不是 QQ 号本身。
        expect(comm.qq).toBe('3379082');
        // 设备身份：电台是设备维度的服务，缺了这些就是每次都被当成新设备。
        expect(comm.OpenUDID).toBe(DEVICE.openUdid);
        expect(comm.udid).toBe(DEVICE.openUdid);
        expect(comm.OpenUDID2).toBe(DEVICE.openUdid);
        expect(comm.aid).toBe(DEVICE.androidId);
        expect(comm.os_ver).toBe('10');
        expect(comm.phonetype).toBe('MI 6');
        expect(comm.devicelevel).toBe('29');
        expect(comm.rom).toBe(DEVICE.fingerprint);
    });

    it('omits uin and falls back to the QQ mobile login type', async () => {
        const { buildQQRadioComm } = await import('@/nativeBridge/api/qq.js');
        const comm = buildQQRadioComm(COOKIE, DEVICE);

        // 参考实现的 android comm 不带 uin（序列化时会丢掉 undefined 键）。
        expect(comm.uin).toBeUndefined();
        // 罐里没有 tmeLoginType 时补手机 QQ 扫码通道的 6。
        expect(comm.tmeLoginType).toBe(6);
    });

    it('keeps the explicit tmeLoginType when the jar already has one', async () => {
        const { buildQQRadioComm } = await import('@/nativeBridge/api/qq.js');
        const comm = buildQQRadioComm(COOKIE, DEVICE);
        // COOKIE 里没有 tmeLoginType，补手机 QQ 扫码通道的 6。
        expect(comm.tmeLoginType).toBe(6);
    });

    it('honours an explicit login type override', async () => {
        const { buildQQRadioComm } = await import('@/nativeBridge/api/qq.js');
        expect(buildQQRadioComm(`${COOKIE}; tmeLoginType=1`, DEVICE, 6).tmeLoginType).toBe(6);
        expect(buildQQRadioComm(COOKIE, DEVICE, 1).tmeLoginType).toBe(1);
    });

    // tmeLoginType 从 cookie 罐读到的值可能是上一条微信会话的残留，所以按本会话的
    // login_type 优先，并且两种标记都排进候选（失败时换一个再试）。
    it('prefers the session channel marker over a leftover tmeLoginType', async () => {
        const { qqRadioLoginTypes } = await import('@/nativeBridge/api/qq.js');
        // QQ 通道（login_type=1）：即使罐里残留 tmeLoginType=1，也先试 6。
        expect(qqRadioLoginTypes('login_type=1; tmeLoginType=1').candidates).toEqual([6, 1]);
        // 微信通道（login_type=2）：先试 1。
        expect(qqRadioLoginTypes('login_type=2; tmeLoginType=1').candidates).toEqual([1, 6]);
        // 两个标记都没有：默认手机 QQ 通道。
        expect(qqRadioLoginTypes('uin=o1').candidates).toEqual([6, 1]);
        expect(qqRadioLoginTypes('uin=o1; tmeLoginType=1').candidates).toEqual([1, 6]);
    });

    it('rebuilds the credential cookie without the o prefix', async () => {
        const { buildQQRadioCookie } = await import('@/nativeBridge/api/qq.js');
        expect(buildQQRadioCookie(COOKIE)).toBe(
            'uin=3379082; qqmusic_uin=3379082; qm_keyst=MUSICKEY; qqmusic_key=MUSICKEY',
        );
    });

    it('falls back to the original cookie when the credential is incomplete', async () => {
        const { buildQQRadioCookie } = await import('@/nativeBridge/api/qq.js');
        const bare = 'uin=o002774749; login_type=1';
        expect(buildQQRadioCookie(bare)).toBe(bare);
    });
});

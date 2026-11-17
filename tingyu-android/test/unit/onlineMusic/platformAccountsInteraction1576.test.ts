import { describe, expect, it } from 'vitest';
import { selectQrLoginStep, qrMethodPrompt, qrMethodLabel } from '../../../src/components/modal/settings/PlatformAccountsPage';

describe('1.5.76 PlatformAccountsPage dual login & method prompts', () => {
    it('opens method picker for multi-channel providers (QQ Music) and goes direct for single-channel providers', () => {
        const qqStep = selectQrLoginStep([
            { id: 'qq', labelKey: 'login.qq', iconKey: 'qq' },
            { id: 'wechat', labelKey: 'login.wechat', iconKey: 'wechat' },
        ]);
        expect(qqStep.kind).toBe('pick');
        if (qqStep.kind === 'pick') {
            expect(qqStep.methods.map(m => m.id)).toEqual(['qq', 'wechat']);
            expect(qqStep.methods.map(qrMethodLabel)).toEqual(['QQ登录', '微信登录']);
        }

        const singleStep = selectQrLoginStep([{ id: 'default', labelKey: '扫码登录', iconKey: 'qr' }]);
        expect(singleStep.kind).toBe('direct');
        if (singleStep.kind === 'direct') {
            expect(singleStep.method?.id).toBe('default');
        }
    });

    it('provides accurate scan prompts for QQ, WeChat, and single-channel platforms', () => {
        expect(qrMethodPrompt('qq', { id: 'qq', labelKey: 'login.qq', iconKey: 'qq' })).toBe('请使用手机QQ扫码授权');
        expect(qrMethodPrompt('qq', { id: 'wechat', labelKey: 'login.wechat', iconKey: 'wechat' })).toBe('请使用微信扫码授权');
        expect(qrMethodPrompt('netease')).toBe('请使用网易云音乐 App 扫码授权');
        expect(qrMethodPrompt('kugou')).toBe('请使用酷狗音乐 App 扫码授权');
        expect(qrMethodPrompt('bodian')).toBe('请使用波点音乐 App 扫码授权');
        expect(qrMethodPrompt('qishui')).toBe('请使用抖音 / 汽水音乐 App 扫码授权');
    });
});

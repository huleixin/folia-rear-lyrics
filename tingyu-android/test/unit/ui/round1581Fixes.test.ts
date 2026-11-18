// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MobileSettingsHeader from '../../../src/components/modal/settings/MobileSettingsHeader';
import { captureSettingsPageLayout } from '../../../src/services/settingsPageLayout';
import type { NativeSettingsFlowNode } from '../../../src/types/nativeSettingsDocument';
import type { PageActions } from '../../../src/types/nativePages';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            if (key === 'mobileSettings.back') return '返回';
            if (key === 'ui.close') return '关闭';
            if (key === 'status.copied') return '已复制';
            return key;
        },
    }),
}));

describe('Round 1.5.81 UI Polish & Attribution Verification', () => {
    it('removes duplicate top-right question mark from secondary MobileSettingsHeader while keeping Back button & title', () => {
        const html = renderToStaticMarkup(
            React.createElement(MobileSettingsHeader, {
                primary: false,
                title: '关于与使用说明',
                onBack: () => {},
                onClose: () => {},
            }),
        );
        expect(html).toContain('关于与使用说明');
        expect(html).toContain('aria-label="返回"');
        expect(html).not.toContain('circle-help');
        expect(html).not.toContain('licenses.title');
    });

    it('projects the centered 4-line Tingyu brand signature cleanly with Copy icon and zero card/border/divider', () => {
        const host = document.createElement('div');
        host.innerHTML = `
            <div data-settings-page-body data-settings-style='{"gap":24,"padding":[22,0,22,0]}' data-settings-layout="column">
                <div data-tingyu-attribution="true" data-testid="about-brand-signature" data-settings-style='{"center":true,"gap":7,"padding":[0,0,0,0]}' data-settings-layout="column">
                    <p data-settings-style='{"center":true,"font":20,"weight":600,"tone":"text"}' data-settings-layout="column">听屿 · Tingyu</p>
                    <p data-settings-style='{"center":true,"font":14,"tone":"muted"}' data-settings-layout="column">Version 1.5.81</p>
                    <p data-settings-style='{"center":true,"font":12,"tone":"muted"}' data-settings-layout="column">Build 297 · fcf3b0eb</p>
                    <button type="button" aria-label="复制版本信息" data-settings-style='{"center":true,"gap":5,"font":12,"minHeight":28,"padding":[8,2,8,2],"tone":"muted"}' data-settings-layout="row">
                        <svg class="lucide lucide-copy" width="13" height="13"></svg>
                        <span>复制版本信息</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(host);
        const nodes: NativeSettingsFlowNode[] = [];
        const actions: PageActions = {};
        const layout = captureSettingsPageLayout(host, nodes, actions);
        document.body.removeChild(host);

        const sig = layout.children?.[0];
        expect(sig).toBeDefined();
        expect(sig?.style?.center).toBe(true);
        expect(sig?.style?.gap).toBe(7);
        expect(sig?.style?.fill).toBeFalsy();
        expect(sig?.style?.border).toBeFalsy();
        expect(sig?.style?.divider).toBeFalsy();
        expect(sig?.children).toHaveLength(4);

        expect(sig?.children?.[0]?.style).toMatchObject({ center: true, font: 20, weight: 600, tone: 'text' });
        expect(sig?.children?.[1]?.style).toMatchObject({ center: true, font: 14, tone: 'muted' });
        expect(sig?.children?.[2]?.style).toMatchObject({ center: true, font: 12, tone: 'muted' });
        expect(sig?.children?.[3]?.kind).toBe('control');
        expect(JSON.stringify(sig?.children?.[3])).toContain('"icon":"copy"');
        expect(JSON.stringify(sig?.children?.[3])).toContain('复制版本信息');
    });
});

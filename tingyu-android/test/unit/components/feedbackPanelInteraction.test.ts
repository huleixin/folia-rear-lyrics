// @vitest-environment jsdom
import React, { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// test/unit/components/feedbackPanelInteraction.test.ts
//
// 「问题反馈」点哪都返回上一页（68743）的行为回归。
//
// 真机上设置页不是直接显示 DOM：captureSettingsDocument 把 DOM 拍成显示列表交给
// Compose 重画，而「无滚动区（area=null）的控件」在 NativeSettingsDocumentView 里最后
// 合成、永远盖在内容之上。原来的全屏遮罩是个 <button onClick={onClose}>，于是被还原成
// 覆盖整块面板的热区，任何一次点击都命中它 → onClose → 面板消失（看起来像返回上一页）。
//
// 这里用真实组件 + React Portal 跑 DOM 事件链，验证：
//   1. 面板内部任意点击都不触发 onClose，也不冒泡到宿主（Portal 合成事件沿 React 树走）；
//   2. 分类 / 输入框 / 开关 / 预览 / 导出各自的状态确实变化，不是「点了没反应」；
//   3. 只有右上角 X 与「点在容器空白（遮罩）上」才关闭，语义严格区分；
//   4. 遮罩装饰层自身（aria-hidden、pointer-events:none）不是可关闭热区。

const mocks = vi.hoisted(() => ({
    onClose: vi.fn(),
    onHostClick: vi.fn(),
    preview: vi.fn(async () => '诊断预览文本'),
    exportPackage: vi.fn(async () => ({ status: 'shared' })),
    exportReport: vi.fn(async () => 'shared'),
    capture: vi.fn(async () => ['data:image/png;base64,AA==']),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ i18n: { language: 'zh-CN' }, t: (key: string) => key }),
}));
vi.mock('@/hooks/useInterfaceAppearance', () => ({ useInterfaceLight: () => false }));
vi.mock('@/services/exportDiagnosticReport', () => ({ exportDiagnosticReport: mocks.exportReport }));
vi.mock('@/services/diagnostics/diagnosticPackage', () => ({
    buildDiagnosticPreview: mocks.preview,
    exportDiagnosticPackage: mocks.exportPackage,
}));
vi.mock('@/services/diagnostics/screenshotCapture', () => ({
    captureScreenshots: mocks.capture,
    MAX_FEEDBACK_SCREENSHOTS: 3,
}));
vi.mock('lucide-react', () => {
    const stub = () => null;
    return {
        Activity: stub, Camera: stub, Check: stub, ChevronLeft: stub, FileArchive: stub,
        Loader2: stub, Music4: stub, Send: stub, Sparkles: stub, Type: stub, X: stub,
    };
});

import FeedbackPanel from '@/components/modal/feedback/FeedbackPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

// 宿主模拟设置页：Portal 的合成事件会沿 React 组件树冒泡到这里（即使 DOM 挂在 body 上）。
// 面板内部的点击必须被 stopPropagation 挡住，不能触发宿主的关闭逻辑。
function Host() {
    return h('div', { 'data-testid': 'host', onClick: mocks.onHostClick },
        h(FeedbackPanel, { onClose: mocks.onClose }));
}

const q = <T extends Element>(selector: string): T => {
    const node = document.querySelector<T>(selector);
    if (!node) throw new Error(`missing ${selector}`);
    return node;
};
const click = (node: Element) => {
    act(() => { (node as HTMLElement).click(); });
};
const clickAsync = async (node: Element) => {
    await act(async () => { (node as HTMLElement).click(); });
};

beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(h(Host)));
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.replaceChildren();
});

describe('问题反馈面板：内部交互绝不触发关闭', () => {
    it('点击 6 个问题类型只切换选中态，不关闭、不冒泡到宿主', () => {
        const ids = ['crash', 'playback', 'lyrics', 'display', 'rear', 'other'];
        for (const id of ids) {
            const button = q<HTMLButtonElement>(`[data-testid="feedback-category-${id}"]`);
            click(button);
            expect(button.getAttribute('aria-pressed')).toBe('true');
        }
        expect(mocks.onClose).not.toHaveBeenCalled();
        expect(mocks.onHostClick).not.toHaveBeenCalled();
    });

    it('点击问题描述输入框能聚焦并输入文字，不关闭', () => {
        const textarea = q<HTMLTextAreaElement>('[data-testid="feedback-description"]');
        click(textarea);
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        act(() => {
            setter?.call(textarea, '在资料库点开一首歌，播放到一半停住');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(textarea.value).toBe('在资料库点开一首歌，播放到一半停住');
        expect(q('[data-testid="feedback-panel"]')).toBeTruthy();
        expect(mocks.onClose).not.toHaveBeenCalled();
    });

    it('诊断日志开关切换 aria-checked，不关闭', () => {
        const toggle = q<HTMLButtonElement>('[data-testid="feedback-include-diagnostics"]');
        expect(toggle.getAttribute('aria-checked')).toBe('true');
        click(toggle);
        expect(toggle.getAttribute('aria-checked')).toBe('false');
        click(toggle);
        expect(toggle.getAttribute('aria-checked')).toBe('true');
        expect(mocks.onClose).not.toHaveBeenCalled();
    });

    it('添加截图按钮能调用采集，不关闭', async () => {
        await clickAsync(q('[data-testid="feedback-add-screenshot"]'));
        // 真实文件选择由原生 SAF 桥接；这里只保证按钮本身不把面板关掉。
        expect(q('[data-testid="feedback-panel"]')).toBeTruthy();
        expect(mocks.onClose).not.toHaveBeenCalled();
    });

    it('预览诊断信息能进入预览态，不关闭', async () => {
        await clickAsync(q('[data-testid="feedback-preview-button"]'));
        expect(mocks.preview).toHaveBeenCalledOnce();
        expect(q('[data-testid="feedback-preview"]').textContent).toBe('诊断预览文本');
        expect(mocks.onClose).not.toHaveBeenCalled();
    });

    it('导出并分享报告能调用导出，不关闭', async () => {
        await clickAsync(q('[data-testid="feedback-export-button"]'));
        expect(mocks.exportPackage).toHaveBeenCalledOnce();
        expect(q('[data-testid="feedback-panel"]')).toBeTruthy();
        expect(mocks.onClose).not.toHaveBeenCalled();
    });

    it('右上角 X 正常关闭（恰好一次），且不误触发宿主', () => {
        click(q('[data-testid="feedback-close"]'));
        expect(mocks.onClose).toHaveBeenCalledOnce();
        expect(mocks.onHostClick).not.toHaveBeenCalled();
    });

    it('只有点在外层容器空白（遮罩）上才关闭；面板与装饰层都不关闭', () => {
        const dialog = q<HTMLElement>('[role="dialog"]');
        const panel = q<HTMLElement>('[data-testid="feedback-panel"]');
        const scrim = q<HTMLElement>('[data-native-decoration="true"]');

        // 装饰层本身：aria-hidden + pointer-events:none，不是可关闭热区。
        click(scrim);
        expect(mocks.onClose).not.toHaveBeenCalled();
        // 面板容器：stopPropagation 挡住，且 target !== currentTarget。
        click(panel);
        expect(mocks.onClose).not.toHaveBeenCalled();
        // 容器自身（点空白处）：target === currentTarget → 关闭一次。
        click(dialog);
        expect(mocks.onClose).toHaveBeenCalledOnce();
    });

    it('遮罩不是可点控件：没有 onClick、带 pointer-events-none 与 aria-hidden', () => {
        const scrim = q<HTMLElement>('[data-native-decoration="true"]');
        expect(scrim.tagName).not.toBe('BUTTON');
        expect(scrim.getAttribute('aria-hidden')).toBe('true');
        expect(scrim.className).toContain('pointer-events-none');
        expect(scrim.className).toContain('inset-0');
    });
});

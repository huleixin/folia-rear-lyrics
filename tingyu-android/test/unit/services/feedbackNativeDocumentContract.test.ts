// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { captureSettingsDocument } from '@/services/nativeSettingsDocument';

// test/unit/services/feedbackNativeDocumentContract.test.ts
//
// 真机专属回归：设置页 DOM 会被 captureSettingsDocument 拍成 paints/controls/areas，
// 交给 Compose 的 NativeSettingsDocumentView 重画。那里有个隐含规则：
//   Controls(null)（无滚动区的控件）在所有 Controls(area) 之后合成 → 永远盖在上层。
// 所以「一个覆盖全屏、无 area 的 click 控件」= 吞掉面板里每一次点击。68743 的
// 全屏遮罩 <button> 正是这样把「点分类/输入框/开关」全变成 onClose 的。
//
// 本用例直接跑采集器，锁住两件事：
//   1. 现版结构不产生任何「全屏 + 无 area 的 click 控件」；
//   2. 把遮罩换回旧版 <button> 就立刻产生一个（证明断言真的能抓到回归，不是空测试）。
// 同时确认分类 / 输入框 / 开关 / 预览 / 导出这些内部控件都被正常采集。

vi.mock('@/services/nativePages', () => ({ absolutePageImage: (value: string) => value }));
vi.mock('@/services/nativeSettingsColor', () => ({ normalizeSettingsColors: (value: unknown) => value }));
vi.mock('@/services/nativeSettingsText', () => ({
    settingsTextRuns: (node: Text, style: CSSStyleDeclaration) =>
        [{ kind: 'text', text: node.textContent, x: 0, y: 0, w: 100, h: 20, color: style.color, font: 12 }],
}));

const VIEW_W = 390, VIEW_H = 844;

/** jsdom 没有布局：按元素 id 给一份稳定的几何，滚动区额外伪造 scrollHeight/clientHeight。 */
function installGeometry() {
    const rects: Record<string, [number, number, number, number]> = {
        root: [0, 0, VIEW_W, VIEW_H],
        dialog: [0, 0, VIEW_W, VIEW_H],
        scrim: [0, 0, VIEW_W, VIEW_H],
        panel: [0, 144, VIEW_W, 700],
        header: [0, 144, VIEW_W, 56],
        close: [330, 156, 40, 40],
        scroll: [0, 200, VIEW_W, 560],
        cat: [16, 220, 170, 44],
        desc: [16, 280, 358, 120],
        toggle: [16, 420, 36, 20],
        shot: [16, 460, 64, 64],
        footer: [0, 760, VIEW_W, 84],
        preview: [16, 776, 170, 52],
        export: [200, 776, 174, 52],
    };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        const [x, y, w, h] = rects[(this as HTMLElement).id] ?? rects.root;
        return new DOMRect(x, y, w, h);
    });
    const scroll = document.getElementById('scroll');
    if (scroll) {
        Object.defineProperty(scroll, 'scrollHeight', { configurable: true, value: 1800 });
        Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 560 });
    }
    const computed = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation(node => {
        const style = computed(node);
        if (!style.opacity) style.opacity = '1';
        return style;
    });
}

/** 与 FeedbackPanel 的真实 DOM 结构一致；scrimAsButton=true 还原出事故版本。 */
function build(scrimAsButton: boolean) {
    document.body.replaceChildren();
    const root = document.createElement('main');
    root.id = 'root';
    root.innerHTML = '<button id="help">问题反馈</button>';
    document.body.append(root);

    const dialog = document.createElement('div');
    dialog.id = 'dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', '问题反馈');
    dialog.style.cssText = 'position:fixed;z-index:160';
    dialog.innerHTML = `
        ${scrimAsButton
            ? '<button id="scrim" type="button" aria-label="关闭遮罩" class="absolute inset-0"></button>'
            : '<div id="scrim" aria-hidden="true" data-native-decoration="true" class="pointer-events-none absolute inset-0"></div>'}
        <div id="panel">
            <div id="header"><button id="close" type="button" aria-label="关闭">X</button></div>
            <div id="scroll" style="overflow-y:auto">
                <button id="cat" type="button">闪退或卡死</button>
                <textarea id="desc" placeholder="问题描述"></textarea>
                <button id="toggle" type="button" role="switch" aria-checked="true">附带诊断日志</button>
                <button id="shot" type="button">添加截图</button>
            </div>
            <div id="footer">
                <button id="preview" type="button">预览诊断信息</button>
                <button id="export" type="button">导出并分享报告</button>
            </div>
        </div>`;
    document.body.append(dialog);
    installGeometry();
    return root;
}

/** Compose 里「无 area 的控件」对应采集结果的 area 为空串。 */
const isFullscreenNullAreaClick = (c: { kind: string; area?: string; w: number; h: number }) =>
    c.kind === 'click' && !c.area && c.w >= VIEW_W * 0.9 && c.h >= VIEW_H * 0.9;

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

it('现版反馈面板：采集结果里不存在覆盖全屏、无滚动区的点击控件', () => {
    const root = build(false);
    const { document: doc } = captureSettingsDocument(root);

    expect(doc.controls.some(isFullscreenNullAreaClick)).toBe(false);
    // 遮罩没有被注册成控件（新结构下它只是装饰层）。
    expect(doc.controls.some(c => c.label === '关闭遮罩')).toBe(false);
    // X 仍在，且是唯一带「关闭」语义的无 area 控件，尺寸很小、盖不住面板。
    const close = doc.controls.find(c => c.label === '关闭');
    expect(close).toBeTruthy();
    expect(isFullscreenNullAreaClick(close!)).toBe(false);
});

it('旧版全屏遮罩 button 会立刻产生一个全屏无 area 控件（断言能抓到回归）', () => {
    const root = build(true);
    const { document: doc } = captureSettingsDocument(root);
    expect(doc.controls.some(isFullscreenNullAreaClick)).toBe(true);
});

it('面板内部交互控件全部被正常采集，且带滚动区 area', () => {
    const root = build(false);
    const { document: doc } = captureSettingsDocument(root);
    const labels = doc.controls.map(c => c.label);

    for (const label of ['闪退或卡死', '附带诊断日志', '添加截图', '预览诊断信息', '导出并分享报告']) {
        expect(labels).toContain(label);
    }
    const description = doc.controls.find(c => c.placeholder === '问题描述');
    expect(description).toMatchObject({ kind: 'text', multiline: true });
    expect(doc.controls.filter(c => c.label === '闪退或卡死')[0].area).toBeTruthy();
});

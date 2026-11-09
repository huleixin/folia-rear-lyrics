// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { captureSemanticSettings } from '@/services/nativeSettingsSemantic';
import { clearSemanticPreviews } from '@/services/settingsSemanticPreview';

// test/unit/services/nativeSettingsSemantic.test.ts
vi.mock('@/services/nativePages', () => ({ absolutePageImage: (value: string) => value }));
vi.stubGlobal('PointerEvent', MouseEvent);
afterEach(() => { clearSemanticPreviews(); vi.restoreAllMocks(); document.body.replaceChildren(); });
function fixture(html: string) {
    document.body.innerHTML = `<main data-native-document-root>${html}</main>`;
    // Any accidental return to rectangle/font/scroll extraction fails this whole suite.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => { throw new Error('DOM geometry is forbidden'); });
    return document.querySelector('main')!;
}
it('projects forms and descriptions to native controls without any DOM layout', () => {
    const root = fixture(`<header><button><svg class="lucide lucide-chevron-left"></svg></button><h1>播放控制</h1></header>
        <h3>歌词</h3><div data-settings-row><div data-settings-title>逐字歌词</div><div data-settings-description>跟随现有时间轴</div><button role="switch" aria-checked="true"></button></div>
        <label>API 密钥<input type="password" value="secret"></label><textarea placeholder="导入配置">JSON</textarea>
        <label>帧率<input type="range" min="30" max="120" step="30" value="60"></label>
        <select aria-label="来源"><option value="a">QQ音乐</option><option value="b" disabled>不可选</option></select>`);
    const { document: doc, actions } = captureSemanticSettings(root, 'playback', '设置');
    expect(doc.paints).toEqual([]); expect(doc.controls).toEqual([]); expect(doc.areas).toEqual([]);
    expect(doc.flow?.title).toBe('播放控制');
    expect(doc.flow?.nodes.find(n => n.kind === 'switch')).toMatchObject({ title: '逐字歌词', hint: '跟随现有时间轴', value: '1' });
    expect(doc.flow?.nodes.find(n => n.inputType === 'password')).toMatchObject({ kind: 'input', immediate: true, value: 'secret' });
    expect(doc.flow?.nodes.find(n => n.kind === 'slider')).toMatchObject({ min: 30, max: 120, step: 30, value: '60' });
    expect(doc.flow?.nodes.find(n => n.kind === 'select')?.options?.[1].disabled).toBe(true);
    expect(actions.back).toBeTypeOf('function');
});
it('reuses existing change/click handlers, supports clearing input, and rejects stale/disabled controls', () => {
    const root = fixture('<input aria-label="用户名" value="old"><button role="switch" aria-checked="false">启用</button><button disabled>删除</button>');
    const input = root.querySelector('input')!, changed = vi.fn(), clicked = vi.fn();
    input.addEventListener('input', changed); root.querySelector('button')!.addEventListener('click', clicked);
    const captured = captureSemanticSettings(root, 'integration', '连接');
    const nodes = captured.document.flow!.nodes;
    captured.actions[`submit:${nodes[0].id}`]?.({ text: '' }); expect(input.value).toBe(''); expect(changed).toHaveBeenCalledOnce();
    captured.actions[`set:${nodes[1].id}`]?.({ text: '1' }); expect(clicked).toHaveBeenCalledOnce();
    input.remove(); captured.actions[`submit:${nodes[0].id}`]?.({ text: 'stale' }); expect(changed).toHaveBeenCalledOnce();
});
it('isolates nested editor content and native dialog actions, retaining parent return paths', () => {
    const root = fixture('<button>父页动作</button><div data-native-settings-editor><header><button><svg class="lucide-chevron-left"></svg></button><h1>歌词过滤</h1></header><button>添加规则</button></div>');
    const modal = document.createElement('div'); modal.dataset.foliaThemedDialog = 'true';
    modal.innerHTML = '<button><svg class="lucide-x"></svg></button><h2>删除规则？</h2><button>取消</button><button>确认删除</button>'; document.body.append(modal);
    const close = vi.fn(); modal.querySelector('button')!.addEventListener('click', close);
    const result = captureSemanticSettings(root, 'filter', '设置');
    expect(result.document.flow!.nodes.map(n => n.title)).not.toContain('父页动作');
    expect(result.document.flow!.title).toBe('歌词过滤');
    expect(result.document.flow!.modal).toMatchObject({ title: '删除规则？' });
    expect(result.document.flow!.modal!.nodes.map(n => n.title)).toEqual(['取消', '确认删除']);
    result.actions.dismiss?.({}); expect(close).toHaveBeenCalledOnce();
});
it('keeps delete-X buttons inside lists and excludes only the actual navigation button', () => {
    const root = fixture('<header><button><svg class="lucide-chevron-left"></svg></button><h1>规则</h1></header><button aria-label="删除这一项"><svg class="lucide-x"></svg></button>');
    expect(captureSemanticSettings(root, 'filter', '设置').document.flow!.nodes).toMatchObject([{ kind: 'action', title: '删除这一项' }]);
});
it('projects hidden files, details, checkboxes, dynamic selects, ruler and native color without losing their actions', () => {
    const root = fixture('<label for="upload">导入文件</label><input id="upload" type="file" hidden><details><summary>展开</summary><button>折叠正文</button></details><button data-native-select data-native-value="a" data-native-options=\'[{"value":"a","label":"A"}]\'>A</button><div data-native-ruler aria-label="偏移" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="20"></div><div data-native-color="#123456"></div>');
    const result = captureSemanticSettings(root, 'tools', '设置');
    expect(result.document.flow!.nodes.map(n => n.kind)).toEqual(['action', 'action', 'select', 'slider', 'color']);
    expect(result.document.flow!.nodes.map(n => n.title)).not.toContain('折叠正文');
    const color = root.querySelector('[data-native-color]')!, listener = vi.fn(); color.addEventListener('tingyu-native-color', listener);
    result.actions[`act:${result.document.flow!.nodes.at(-1)!.id}`]?.({ text: '#abcdef' }); expect(listener).toHaveBeenCalledOnce();
});
it('lets Compose place and clip the sole preview island, ignoring its frame-by-frame DOM', () => {
    const root = fixture('<div data-native-live="true" data-folia-stage-preview><span>歌词预览</span><button>暂停</button></div><button>保存</button>');
    const result = captureSemanticSettings(root, 'editor', '舞台设置'), node = result.document.flow!.nodes[0];
    expect(result.document.flow!.nodes.map(n => n.kind)).toEqual(['preview', 'action', 'action']);
    expect(result.document.flow!.nodes[1].title).toBe('暂停');
    result.actions[`preview:${node.id}`]?.({ text: JSON.stringify({ x: 16, y: 92, w: 320, h: 240, top: 10, bottom: 0 }) });
    const preview = root.querySelector<HTMLElement>('[data-native-live]')!;
    expect(preview.style.top).toBe('92px'); expect(preview.style.clipPath).toContain('10px'); expect(preview.dataset.nativePreviewReady).toBe('true');
    result.actions[`preview:${node.id}`]?.({ text: '{"w":null}' }); expect(preview.style.top).toBe('92px');
    clearSemanticPreviews(); expect(preview.style.top).toBe('');
});

it('retains mixed checkbox state for selective configuration import', () => {
    const root = fixture('<button role="checkbox" aria-label="主题配置" aria-checked="mixed"></button>');
    const result = captureSemanticSettings(root, 'import', '导入');
    expect(result.document.flow!.nodes[0]).toMatchObject({ kind: 'checkbox', value: 'mixed', title: '主题配置' });
    expect(result.actions[`set:${result.document.flow!.nodes[0].id}`]).toBeTypeOf('function');
});

it('preserves labelled checkbox values, radio selection and disabled capabilities', () => {
    const root = fixture('<label>候选样式<input type="checkbox" checked disabled></label><button role="radio" aria-checked="true">浅色</button><div data-settings-disabled="true"><button>覆盖日志</button></div>');
    const nodes = captureSemanticSettings(root, 'appearance', '外观').document.flow!.nodes;
    expect(nodes[0]).toMatchObject({ kind: 'checkbox', value: '1', title: '候选样式', disabled: true });
    expect(nodes[1]).toMatchObject({ title: '浅色', detail: '✓' }); expect(nodes[2].disabled).toBe(true);
});

it('keeps lyric format ordering reachable as a native control with the existing event handler', () => {
    const root = fixture('<div data-native-order=\'["lrc","ttml","ass"]\' aria-label="格式优先级"><span>旧拖拽把手</span></div>');
    const apply = vi.fn(); root.firstElementChild!.addEventListener('tingyu-native-order', apply);
    const result = captureSemanticSettings(root, 'playback', '播放'), node = result.document.flow!.nodes[0];
    expect(node.kind).toBe('reorder'); expect(node.options?.map(o => o.value)).toEqual(['lrc', 'ttml', 'ass']);
    result.actions[`act:${node.id}`]({ text: '["ass","lrc","ttml"]' }); expect(apply).toHaveBeenCalledOnce();
});

it('forwards focus, blur, IME submit and lazy option loading through the existing controls', () => {
    const root = fixture('<input aria-label="配置"><button data-native-select data-native-value="a" data-native-options=\'[{"value":"a","label":"A"},{"value":"b","label":"B","disabled":true}]\'>A</button>');
    const focus = vi.fn(), blur = vi.fn(), enter = vi.fn(), open = vi.fn(), select = vi.fn();
    const input = root.querySelector('input')!, button = root.querySelector('button')!;
    input.addEventListener('focusin', focus); input.addEventListener('focusout', blur); input.addEventListener('keydown', enter);
    button.addEventListener('click', open); button.addEventListener('tingyu-native-value', select);
    const result = captureSemanticSettings(root, 'editor', '配置'), [field, choice] = result.document.flow!.nodes;
    result.actions[`focus:${field.id}`]({ value: 1 }); result.actions[`focus:${field.id}`]({ value: 0 }); result.actions[`enter:${field.id}`]({});
    result.actions[`open:${choice.id}`]({}); result.actions[`set:${choice.id}`]({ text: 'b' });
    expect(focus).toHaveBeenCalledOnce(); expect(blur).toHaveBeenCalledOnce(); expect(enter).toHaveBeenCalledOnce(); expect(open).toHaveBeenCalledOnce(); expect(select).not.toHaveBeenCalled();
    result.actions[`set:${choice.id}`]({ text: 'a' }); expect(select).toHaveBeenCalledOnce();
});

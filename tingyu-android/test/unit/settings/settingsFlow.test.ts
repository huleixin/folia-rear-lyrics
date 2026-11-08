import { describe, expect, it } from 'vitest';
import { createFlowBuilder, hintOf, toFlow } from '../../../src/components/modal/settings/flow/flowBuilder';
import { buildSettingsFlow } from '../../../src/components/modal/settings/flow';
import type { TFunction } from 'i18next';

// test/unit/settings/settingsFlow.test.ts
//
// 语义化设置页的契约测试（原生化专项·第 22 轮）。
//
// 这一层是「React 业务状态 → Compose 原生控件」的唯一桥梁，错一位的表现是
// 设置项消失、值不动、或点了没反应 —— 都是用户能立刻看到的。这里锁四件事：
//   1. 每种控件产出的节点 kind / value 编码与 Kotlin 侧解析一致；
//   2. 每个可交互节点都有对应 handler，不允许出现"画得出来点不动"；
//   3. 分组头的切分顺序（Compose 按它开卡片）；
//   4. 未迁移分区必须返回 null —— 那意味着继续走旧的测量路径，不能悄悄给个空页面。

const t = ((key: string) => key) as unknown as TFunction;

describe('声明式设置页构建器', () => {
    it('开关用 "1"/"0" 编码，点击回传取反后的值', () => {
        const b = createFlowBuilder('s', 'S');
        let calls = 0;
        b.toggle('dark', '深色', false, next => { calls += 1; expect(next).toBe(true); });
        expect(b.nodes[0]).toMatchObject({ id: 'dark', kind: 'switch', title: '深色', value: '0' });
        b.handlers.dark?.();
        expect(calls).toBe(1);
    });

    it('下拉与滑块的 handler 只接受各自类型的负载', () => {
        const b = createFlowBuilder('s', 'S');
        const picked: string[] = [];
        const slid: number[] = [];
        b.select('theme', '主题', 'mint', [{ value: 'mint', label: '薄荷' }], value => picked.push(value));
        b.slider('fps', '帧率', 60, 30, 120, 30, ' FPS', value => slid.push(value));
        expect(b.nodes[1]).toMatchObject({ kind: 'slider', value: '60', min: 30, max: 120, step: 30, unit: ' FPS' });
        b.handlers.theme?.({ text: 'ocean' });
        b.handlers.fps?.({ value: 90 });
        // 错误的负载被忽略，不会把 undefined 写进 store。
        b.handlers.theme?.({ value: 1 });
        b.handlers.fps?.({ text: 'nope' });
        expect(picked).toEqual(['ocean']);
        expect(slid).toEqual([90]);
    });

    it('输入框只在拿到文本时提交', () => {
        const b = createFlowBuilder('s', 'S');
        const submitted: string[] = [];
        b.input('rename', '重命名', '旧名', '确定', text => submitted.push(text));
        expect(b.nodes[0]).toMatchObject({ kind: 'input', value: '旧名', confirmLabel: '确定' });
        b.handlers.rename?.({});
        b.handlers.rename?.({ text: '新名' });
        expect(submitted).toEqual(['新名']);
    });

    it('分组头按声明顺序切分，标题与说明都保留', () => {
        const b = createFlowBuilder('s', 'S');
        b.group('第一组', '组说明');
        b.toggle('a', 'A', true, () => undefined);
        b.group('第二组');
        b.action('more', '更多', () => undefined, { detail: '3 项' });
        const flow = toFlow('s', '标题', '副标题', b);
        expect(flow.nodes.map(node => node.kind)).toEqual(['group', 'switch', 'group', 'action']);
        expect(flow.nodes[0]).toMatchObject({ title: '第一组', hint: '组说明' });
        expect(flow.nodes[3]).toMatchObject({ detail: '3 项' });
        expect(flow.key).toBe('settings-flow:s');
    });

    it('每个可交互节点都注册了 handler（画得出来就必须点得动）', () => {
        const b = createFlowBuilder('s', 'S');
        b.toggle('a', 'A', false, () => undefined);
        b.select('b', 'B', 'x', [], () => undefined);
        b.slider('c', 'C', 1, 0, 2, 1, '', () => undefined);
        b.action('d', 'D', () => undefined);
        b.input('e', 'E', '', '确定', () => undefined);
        b.note('只是一句说明');
        const interactive = b.nodes.filter(node => node.kind !== 'group' && node.kind !== 'note');
        expect(interactive.length).toBe(5);
        for (const node of interactive) expect(b.handlers[node.id]).toBeTypeOf('function');
        expect(Object.keys(b.handlers)).toHaveLength(5);
    });

    it('hintOf 用换行承载第二段说明，空段不留下空行', () => {
        expect(hintOf('描述', '补充')).toBe('描述\n补充');
        expect(hintOf('描述', undefined, false)).toBe('描述');
        expect(hintOf()).toBeUndefined();
    });

    it('未迁移的分区返回 null（继续用测量路径，而不是给一张空页面）', () => {
        for (const section of ['appearance', 'playback', 'storage', 'developer', 'integration', 'lab']) {
            expect(buildSettingsFlow(section, { t, title: 'x', subtitle: 'y' }), section).toBeNull();
        }
    });

    it('通用分区的每一行都带 handler，且分组标题来自既有 i18n key', () => {
        const result = buildSettingsFlow('general', { t, title: '通用', subtitle: '' });
        // 库套件选择 / Bravais 外观出现时整页回落测量路径 —— 两种结果都合法，
        // 但一旦交出页面，就必须是完整可交互的。
        if (!result) return;
        const nodes = result.flow.nodes;
        expect(nodes.some(node => node.kind === 'group')).toBe(true);
        const interactive = nodes.filter(node => node.kind !== 'group' && node.kind !== 'note');
        expect(interactive.length).toBeGreaterThan(5);
        for (const node of interactive) {
            expect(result.handlers[node.id], node.id).toBeTypeOf('function');
            expect(node.title).toBeTruthy();
        }
        // 屏幕常亮与手机适配这两组在 Android 上必然出现。
        expect(nodes.some(node => node.title === 'options.keepScreenOn')).toBe(true);
        expect(nodes.some(node => node.title === 'options.phoneFit')).toBe(true);
    });

    it('Android 上无内容的分区交出空页面（不再测量一棵空 DOM 树）', () => {
        for (const section of ['interaction', 'desktop', 'mods']) {
            const result = buildSettingsFlow(section, { t, title: 'x', subtitle: 'y' });
            expect(result, section).not.toBeNull();
            expect(result!.flow.nodes.every(node => node.kind === 'note')).toBe(true);
            expect(Object.keys(result!.handlers)).toHaveLength(0);
        }
    });
});

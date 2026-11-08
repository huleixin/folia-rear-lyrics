import type { NativeSettingsFlow, NativeSettingsFlowNode } from '../../../../types/nativeSettingsDocument';

// src/components/modal/settings/flow/flowBuilder.ts
//
// 设置分区 → 语义化设置页模型的构造器（原生化专项·第 22 轮）。
//
// 为什么要有这一层：11 个设置分区目前靠「DOM 逐元素测量 + Compose 画 Canvas 复刻」呈现，
// 排版真值源在 WebView。要让 Compose 真正自己排版，页面就必须交出「有什么」这份声明。
//
// 这一层的职责只是**把既有的业务状态翻译成节点**：
//   · 读的还是原来那些 zustand store，调的还是原来那些 handler；
//   · 不新增任何业务判断，不缓存状态，不复制规则；
//   · 每个节点带一个 id，点击时按 id 回到原来的闭包 —— 与二级操作面板同一套哲学。
//
// 约束（刻意保留在类型里）：构造器是纯函数，不调用 hook，不做副作用。
// 因此它可以被 SettingsModal 在渲染期直接调用，且天然可测。

export type FlowHandlers = Record<string, (payload?: { text?: string; value?: number }) => void>;

export type FlowOption = { value: string; label: string };

export type FlowBuilder = {
    nodes: NativeSettingsFlowNode[];
    handlers: FlowHandlers;
    /** 开一张分组卡片。后续行都归入这张卡，直到下一个 group。 */
    group(title: string, hint?: string): void;
    /** 开关。`hint` 可以带换行（描述 + 附加说明）。 */
    toggle(id: string, title: string, checked: boolean, onChange: (next: boolean) => void, opts?: {
        hint?: string;
        disabled?: boolean;
        icon?: string;
    }): void;
    /** 下拉单选。 */
    select(id: string, title: string, value: string, options: FlowOption[], onChange: (value: string) => void, opts?: {
        hint?: string;
        disabled?: boolean;
        placeholder?: string;
    }): void;
    /** 连续滑块（松手提交终值，与原生 SettingsSlider 一致）。 */
    slider(id: string, title: string, value: number, min: number, max: number, step: number, unit: string,
        onChange: (value: number) => void, opts?: { hint?: string; disabled?: boolean }): void;
    /** 二级入口 / 操作按钮。 */
    action(id: string, title: string, onClick: () => void, opts?: {
        hint?: string;
        detail?: string;
        icon?: string;
        disabled?: boolean;
        tone?: 'danger';
    }): void;
    /** 文本输入（确认后提交整值）。 */
    input(id: string, title: string, value: string, confirmLabel: string, onSubmit: (text: string) => void, opts?: {
        hint?: string;
        placeholder?: string;
        multiline?: boolean;
        disabled?: boolean;
    }): void;
    /** 只读说明。 */
    note(text: string, tone?: 'muted' | 'error' | 'accent'): void;
};

export function createFlowBuilder(section: string, title: string): FlowBuilder {
    const nodes: NativeSettingsFlowNode[] = [];
    const handlers: FlowHandlers = {};
    let sequence = 0;
    const nextId = (prefix: string) => `${section}:${prefix}:${++sequence}`;

    return {
        nodes,
        handlers,
        group(groupTitle, hint) {
            nodes.push({ id: nextId('group'), kind: 'group', title: groupTitle, hint });
        },
        toggle(id, title, checked, onChange, opts) {
            handlers[id] = () => onChange(!checked);
            nodes.push({
                id, kind: 'switch', title, value: checked ? '1' : '0',
                hint: opts?.hint, icon: opts?.icon, disabled: opts?.disabled,
            });
        },
        select(id, title, value, options, onChange, opts) {
            handlers[id] = payload => {
                if (payload?.text !== undefined) onChange(payload.text);
            };
            nodes.push({
                id, kind: 'select', title, value, options,
                hint: opts?.hint, disabled: opts?.disabled, placeholder: opts?.placeholder,
            });
        },
        slider(id, title, value, min, max, step, unit, onChange, opts) {
            handlers[id] = payload => {
                if (typeof payload?.value === 'number') onChange(payload.value);
            };
            nodes.push({
                id, kind: 'slider', title, value: String(value), min, max, step, unit,
                hint: opts?.hint, disabled: opts?.disabled,
            });
        },
        action(id, title, onClick, opts) {
            handlers[id] = () => onClick();
            nodes.push({
                id, kind: 'action', title, hint: opts?.hint, detail: opts?.detail,
                icon: opts?.icon, disabled: opts?.disabled, value: opts?.tone === 'danger' ? 'danger' : '',
            });
        },
        input(id, title, value, confirmLabel, onSubmit, opts) {
            handlers[id] = payload => {
                if (payload?.text !== undefined) onSubmit(payload.text);
            };
            nodes.push({
                id, kind: 'input', title, value, confirmLabel,
                hint: opts?.hint, placeholder: opts?.placeholder,
                multiline: opts?.multiline, disabled: opts?.disabled,
            });
        },
        note(text, tone) {
            nodes.push({ id: nextId('note'), kind: 'note', title: text, value: tone ?? 'muted' });
        },
    };
}

/** 把构造器结果包成下发给原生的页面模型。 */
export function toFlow(section: string, title: string, subtitle: string, builder: FlowBuilder): NativeSettingsFlow {
    return { key: `settings-flow:${section}`, title, subtitle, nodes: builder.nodes };
}

/** 拼「描述 + 附加说明」：原生节点只有一个 hint 字段，用换行承载第二段。 */
export function hintOf(...parts: Array<string | undefined | null | false>): string | undefined {
    const lines = parts.filter((part): part is string => typeof part === 'string' && part.length > 0);
    return lines.length ? lines.join('\n') : undefined;
}

import { AnimatePresence } from 'framer-motion';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import MobileSheet from '../MobileSheet';
import {
    canUseNativePanels,
    decodePanelAction,
    markNativePanels,
    nativePanelsReady,
    onNativePanelAction,
    pushNativePanel,
    removeNativePanel,
} from '../../../../services/nativePanels';
import type { NativePanelBlock, NativePanelModel } from '../../../../types/nativePanels';

// src/library/suites/mobile/native/OperationPanel.tsx
//
// 二级操作面板的唯一渲染入口（原生化专项·第 21 轮）。
//
// 调用方只做两件事：
//   1. 用既有业务状态拼一份 NativePanelModel（有哪些动作、可用不可用、当前值）；
//   2. 在 onAction 里按 id 分派到**原有的闭包**。
//
// 渲染由本组件决定：Android 原生可用 → 推给 Compose 画；否则（桌面 / 网页 / 旧包）
// → 用 MobileSheet 画同一份模型。两条路径消费同一个 spec，不存在"原生有、网页没有"
// 的分叉，也不存在第二份业务逻辑。
//
// 关闭语义：panel 变 null 时先推 enabled=false 让原生播完退场动画，再卸载；
// 用户从原生侧关掉（遮罩/返回/关闭键）会走 dismiss，回调 onClose 把 React 状态对齐。

export type PanelActionPayload = { text?: string };
export type PanelActionHandler = (id: string, payload?: PanelActionPayload) => void;

type Props = {
    /** null = 关闭。保持组件常挂，原生才能播完退场动画。 */
    panel: NativePanelModel | null;
    onAction: PanelActionHandler;
    onClose: () => void;
    /** 面板身份，用于会话对账；同名面板会互相替换。 */
    id?: string;
    /** menu 形态的锚点元素（取 boundingClientRect 交给原生定位）。 */
    anchorRef?: React.RefObject<HTMLElement | null>;
};

function readAnchor(node: HTMLElement | null | undefined) {
    if (!node) return undefined;
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height) return undefined;
    return { x: box.left, y: box.top, w: box.width, h: box.height };
}

function newPanelSession(): string {
    // 与 nativeMinimalPlayer 同一套兜底：老 WebView 里 crypto.randomUUID 可能不存在，
    // 而 session 是面板包对账的唯一凭据，缺了它就等于收不到任何动作。
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `panel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function OperationPanel({ panel, onAction, onClose, id = 'overlay', anchorRef }: Props) {
    // null = 还在探测；探测过一次之后就记住结论，后续面板不再等一个微任务。
    const [native, setNative] = useState<boolean | null>(() => (nativePanelsReady() ? true : null));
    const session = useRef<string>('');
    if (!session.current) session.current = newPanelSession();
    const revision = useRef(0);
    const lastPushed = useRef('');
    /** 原生这一帧没接住（乱序 / 路由不匹配 / 桥报错）→ 立刻改用 DOM，绝不留白。 */
    const [rejected, setRejected] = useState(false);
    const latest = useRef({ onAction, onClose });
    latest.current = { onAction, onClose };

    useEffect(() => {
        if (native !== null) return;
        let alive = true;
        void canUseNativePanels().then(ok => {
            if (!alive) return;
            markNativePanels(ok);
            setNative(ok);
        });
        return () => { alive = false; };
    }, [native]);

    // 原生可用时订阅动作回传。session/id 不匹配的事件直接丢弃 —— 那是上一张面板的尾巴。
    useEffect(() => {
        if (native !== true) return;
        let listener: { remove(): Promise<void> } | undefined;
        let disposed = false;
        void onNativePanelAction(event => {
            if (disposed || event.id !== id || event.session !== session.current) return;
            const decoded = decodePanelAction(event);
            if (decoded.kind === 'dismiss') { latest.current.onClose(); return; }
            if (decoded.kind === 'action') latest.current.onAction(decoded.id);
            else latest.current.onAction(decoded.id, { text: decoded.text });
        }).then(value => { if (disposed) void value.remove(); else listener = value; });
        return () => { disposed = true; void listener?.remove(); };
    }, [native, id]);

    const frame = useMemo(() => {
        if (!panel) return null;
        return {
            id,
            session: session.current,
            title: panel.title,
            subtitle: panel.subtitle ?? '',
            busy: panel.busy ?? false,
            error: panel.error ?? '',
            kind: panel.kind ?? 'sheet',
            heightFraction: panel.heightFraction ?? 0.86,
            anchor: panel.kind === 'menu' ? readAnchor(anchorRef?.current) : undefined,
            blocks: panel.blocks,
        };
    }, [panel, id, anchorRef]);

    // 面板关闭时清掉"被拒"标记：下一次打开是新的机会，不能因为上一张被拒就一直画 DOM。
    const open = panel !== null;
    useEffect(() => { if (!open) setRejected(false); }, [open]);

    // 内容变化就推一帧；内容不变不重复过桥（revision 在推送时才自增，
    // 否则每次渲染都会生成"看起来不同"的帧，形成无休止的推送）。
    useEffect(() => {
        if (native !== true) return;
        const serialized = JSON.stringify(frame);
        if (serialized === lastPushed.current) return;
        lastPushed.current = serialized;
        if (!frame) { void removeNativePanel(id, session.current); return; }
        revision.current += 1;
        let alive = true;
        void pushNativePanel({ ...frame, revision: revision.current, enabled: true })
            .then(result => { if (alive && !result.accepted) setRejected(true); })
            .catch(() => { if (alive) setRejected(true); });
        return () => { alive = false; };
    }, [frame, native, id]);

    // 卸载时清掉原生面板（页面整体退场、路由切换）。
    useEffect(() => () => { if (native === true) void removeNativePanel(id, session.current); }, [native, id]);

    // 只有"确定原生不可用"或"这一帧被拒"才画 DOM。探测期什么都不画 ——
    // 画了再撤会让用户看到一次闪动，而探测本身只占一个微任务。
    const drawDom = native === false || rejected;
    return <AnimatePresence>{panel && drawDom ? <DomPanel key={id} panel={panel} onAction={onAction} onClose={onClose} /> : null}</AnimatePresence>;
}

/** 非原生环境的等价渲染：消费同一份 spec，产出与 .ml-sheet 一致的 DOM。 */
function DomPanel({ panel, onAction, onClose }: { panel: NativePanelModel; onAction: PanelActionHandler; onClose: () => void }) {
    return (
        <MobileSheet title={panel.title} onClose={onClose}>
            {panel.subtitle ? <p className="ml-sheet-hint">{panel.subtitle}</p> : null}
            {panel.blocks.map(block => (
                <DomBlock key={block.id} block={block} onAction={onAction} onClose={onClose} />
            ))}
            {panel.error ? (
                <p className="ml-error" role="alert">
                    {panel.error}
                </p>
            ) : null}
        </MobileSheet>
    );
}

function DomBlock({
    block,
    onAction,
    onClose,
}: {
    block: NativePanelBlock;
    onAction: PanelActionHandler;
    onClose: () => void;
}) {
    const [draft, setDraft] = useState(block.kind === 'input' ? block.value : '');
    useEffect(() => {
        if (block.kind === 'input') setDraft(block.value);
    }, [block]);

    if (block.kind === 'actions') {
        return (
            <>
                {block.label ? <p className="ml-sheet-hint">{block.label}</p> : null}
                {block.items.map(item => (
                    <button
                        key={item.id}
                        className="ml-sheet-action"
                        disabled={item.disabled}
                        aria-pressed={item.selected || undefined}
                        onClick={() => onAction(item.id)}
                    >
                        <span>
                            <strong>{item.label}</strong>
                            {item.hint ? <small>{item.hint}</small> : null}
                        </span>
                        {item.badge ? <small>{item.badge}</small> : null}
                    </button>
                ))}
            </>
        );
    }
    if (block.kind === 'select') {
        return (
            <div className="ml-prompt">
                <label>
                    {block.label}
                    <select
                        value={block.value}
                        disabled={block.disabled}
                        onChange={event => onAction(block.id, { text: event.target.value })}
                    >
                        {block.options.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
        );
    }
    if (block.kind === 'toggle') {
        return (
            <button
                className="ml-sheet-action"
                disabled={block.disabled}
                aria-pressed={block.value}
                onClick={() => onAction(block.id, { text: block.value ? '0' : '1' })}
            >
                <span>
                    <strong>{block.label}</strong>
                    {block.hint ? <small>{block.hint}</small> : null}
                </span>
                <small>{block.value ? '开' : '关'}</small>
            </button>
        );
    }
    if (block.kind === 'input') {
        return (
            <form
                className="ml-prompt"
                onSubmit={event => {
                    event.preventDefault();
                    if (draft.trim()) onAction(block.id, { text: draft });
                }}
            >
                {block.label ? <label>{block.label}</label> : null}
                <input
                    autoFocus
                    aria-label={block.label || block.placeholder || block.confirmLabel}
                    placeholder={block.placeholder}
                    value={draft}
                    onChange={event => setDraft(event.target.value)}
                />
                <button className="ml-solid" disabled={!draft.trim()}>
                    {block.confirmLabel}
                </button>
                <button type="button" className="ml-text-button" onClick={onClose}>
                    取消
                </button>
            </form>
        );
    }
    if (block.kind === 'confirm') {
        return (
            <form
                className="ml-prompt"
                onSubmit={event => {
                    event.preventDefault();
                    onAction(block.id);
                }}
            >
                {block.label ? <label>{block.label}</label> : null}
                <p>{block.message}</p>
                <button className="ml-solid">{block.confirmLabel}</button>
                <button type="button" className="ml-text-button" onClick={onClose}>
                    {block.cancelLabel || '取消'}
                </button>
            </form>
        );
    }
    return <p className={block.tone === 'error' ? 'ml-error' : 'ml-sheet-hint'}>{block.text}</p>;
}

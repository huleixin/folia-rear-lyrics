import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import type { CustomSelectOption } from './CustomSelectMenu';

// src/components/shared/useCustomSelectNavigation.ts
// CustomSelect 的开合状态、外部点击收起与键盘操作。下面这些行为对全仓所有 CustomSelect 用法都生效，
// 不受任何参数控制。
//
// 菜单打开期间才在捕获阶段装这些监听：
// - document 上的 mousedown：命令面板的面板根节点写了 onMouseDown stopPropagation，冒泡阶段的
//   document 监听收不到面板内的点击，菜单就关不掉（还会和另一个下拉同时开着）。
// - document 上的 focusin：焦点落到触发按钮和菜单以外时收起（同原生 select 失焦即收）。
// - window 上的 keydown：Escape 只关菜单并 stopPropagation——命令面板和设置弹窗都在 window 的
//   冒泡阶段听 Escape，不拦下会连外层一起关掉；↑↓ / Home / End 移动高亮，Enter 选中高亮项。
//   做法与 JoinCommunityButton 的菜单一致。
// 菜单关着时，焦点在触发按钮上按 ↑↓ / Enter 打开菜单（同样 stopPropagation，命令面板的 Enter
// 不会把它当成「执行当前命令」）；空格交给按钮原生激活。
//
// 高亮按值记，不按下标：调用方可以在 onOpen 里才去填选项（播放设置的音频输出设备就是打开时才枚举），
// 菜单开着选项就变了。按下标记的高亮会停在同一位置上换进来的别的项，Enter 选中的就不是看着的那一项。
//
// 高亮停在当前值上按 Enter 只收起菜单，不调用 onChange：原生 select 不为没变的值发 change，改动前
// 焦点在触发按钮上「Enter 打开、Enter 关闭」也从不调用 onChange（GridView 换每日推荐日期、播放设置
// 换输出设备这些 onChange 都有副作用）。鼠标点当前项照旧报告——那是改动前就有的行为，
// FoliumSelectField 也靠它把陈旧的存储值写成显示出来的回退值。

/**
 * 高亮项。value 为 null 表示没有高亮；value 不在选项里时也不高亮任何一行，等选项里出现它再高亮。
 * fromKeyboard 为 true 时菜单要把它滚进视野（键盘移动高亮，或用键盘打开菜单）；指针悬停产生的
 * 高亮不滚动，免得列表在鼠标下面跑。
 */
export interface CustomSelectActiveOption {
    value: string | null;
    fromKeyboard: boolean;
}

interface UseCustomSelectNavigationArgs {
    options: CustomSelectOption[];
    value: string;
    disabled: boolean;
    onOpen?: () => void;
    onChange: (value: string) => void;
    containerRef: RefObject<HTMLElement | null>;
    menuRef: RefObject<HTMLElement | null>;
    triggerRef: RefObject<HTMLButtonElement | null>;
}

/** 键盘移动一格后的高亮下标：没有高亮时 ↓ 落到第一项、↑ 落到最后一项；其余夹在两端，不循环（同原生 select）。 */
export const stepCustomSelectIndex = (current: number, delta: 1 | -1, count: number): number => {
    if (count <= 0) return -1;
    if (current < 0 || current >= count) return delta > 0 ? 0 : count - 1;
    return Math.min(count - 1, Math.max(0, current + delta));
};

/** 某个值在当前选项里的下标；null 或不在选项里为 -1。 */
const findOptionIndex = (options: CustomSelectOption[], value: string | null) => (
    value === null ? -1 : options.findIndex((option) => option.value === value)
);

const hasCommandModifier = (event: { altKey: boolean; ctrlKey: boolean; metaKey: boolean }) => (
    event.altKey || event.ctrlKey || event.metaKey
);

export const useCustomSelectNavigation = ({
    options,
    value,
    disabled,
    onOpen,
    onChange,
    containerRef,
    menuRef,
    triggerRef,
}: UseCustomSelectNavigationArgs) => {
    const [isOpen, setIsOpen] = useState(false);
    const [active, setActive] = useState<CustomSelectActiveOption>({ value: null, fromKeyboard: false });
    // 每次渲染按最新的选项换算，选项在菜单开着时变了也落在同一项上。
    const activeIndex = findOptionIndex(options, active.value);

    const close = useCallback(() => setIsOpen(false), []);

    const select = useCallback((nextValue: string) => {
        onChange(nextValue);
        setIsOpen(false);
    }, [onChange]);

    // 每次打开都从当前选中项开始高亮。用键盘打开时把它滚进视野：长列表里当前项可能在视口以下，
    // 虚拟化分支里那一行甚至还没渲染。
    const open = (fromKeyboard: boolean) => {
        if (disabled) return;
        onOpen?.();
        setActive({ value, fromKeyboard });
        setIsOpen(true);
    };

    // Toggle the dropdown menu visibility
    const toggle = (fromKeyboard: boolean) => {
        if (disabled) return;
        if (isOpen) close();
        else open(fromKeyboard);
    };

    // 空格（以及读屏的默认动作）激活按钮时，浏览器补发的 click 的 detail 为 0；真实的指针点击至少为 1。
    const handleTriggerClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
        toggle(event.detail === 0);
    };

    // 指针移到某一项上：高亮跟着指针走（与原先的悬停底色一致）。
    const activateFromPointer = useCallback((optionValue: string) => {
        setActive((previous) => (
            previous.value === optionValue && !previous.fromKeyboard ? previous : { value: optionValue, fromKeyboard: false }
        ));
    }, []);

    // 指针离开菜单：指针留下的高亮退回选中项，视觉上与原先「离开即清掉悬停底色」相同；键盘高亮保留。
    const releasePointer = useCallback(() => {
        setActive((previous) => (
            previous.fromKeyboard || previous.value === value
                ? previous
                : { value, fromKeyboard: false }
        ));
    }, [value]);

    const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (isOpen || disabled || hasCommandModifier(event) || event.nativeEvent.isComposing) return;
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
        event.preventDefault();
        event.stopPropagation();
        open(true);
    };

    // 监听只随开合装卸一次；按键时读最新的选项、值、高亮和回调。
    const latest = useRef({ options, value, active, select, close });
    latest.current = { options, value, active, select, close };

    useEffect(() => {
        if (!isOpen) return undefined;

        const isOutside = (target: EventTarget | null) => (
            !containerRef.current?.contains(target as Node) && !menuRef.current?.contains(target as Node)
        );

        // Close the dropdown when clicking outside of the container
        const handlePointerDown = (event: MouseEvent) => {
            if (isOutside(event.target)) latest.current.close();
        };

        // 焦点被移到别处（例如命令面板把打字转给它的输入框）也收起，免得之后的 Enter 被菜单截走。
        const handleFocusIn = (event: FocusEvent) => {
            if (isOutside(event.target)) latest.current.close();
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.isComposing || hasCommandModifier(event)) return;
            const { options: currentOptions, value: currentValue, active: currentActive } = latest.current;
            const count = currentOptions.length;
            const currentIndex = findOptionIndex(currentOptions, currentActive.value);
            const moveTo = (index: number) => setActive({ value: currentOptions[index]?.value ?? null, fromKeyboard: true });

            switch (event.key) {
                case 'Escape':
                    latest.current.close();
                    triggerRef.current?.focus({ preventScroll: true });
                    break;
                case 'ArrowDown':
                case 'ArrowUp':
                    moveTo(stepCustomSelectIndex(currentIndex, event.key === 'ArrowDown' ? 1 : -1, count));
                    break;
                case 'Home':
                    moveTo(count > 0 ? 0 : -1);
                    break;
                case 'End':
                    moveTo(count - 1);
                    break;
                case 'Enter': {
                    if (event.repeat) break;
                    const option = currentOptions[currentIndex];
                    // 停在当前值上只收起，不报告没变的值（见文件头）。
                    if (option && option.value !== currentValue) latest.current.select(option.value);
                    else latest.current.close();
                    triggerRef.current?.focus({ preventScroll: true });
                    break;
                }
                case 'Tab':
                    // 焦点照常移走，菜单跟着收起。
                    latest.current.close();
                    return;
                default:
                    return;
            }
            event.preventDefault();
            event.stopPropagation();
        };

        document.addEventListener('mousedown', handlePointerDown, true);
        document.addEventListener('focusin', handleFocusIn, true);
        window.addEventListener('keydown', handleKeyDown, true);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown, true);
            document.removeEventListener('focusin', handleFocusIn, true);
            window.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [containerRef, isOpen, menuRef, triggerRef]);

    return {
        isOpen,
        activeIndex,
        followActive: active.fromKeyboard,
        select,
        activateFromPointer,
        releasePointer,
        handleTriggerClick,
        handleTriggerKeyDown,
    };
};

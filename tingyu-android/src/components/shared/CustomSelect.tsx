import React, { useState, useRef, useLayoutEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Theme } from '../../types';
import {
    CustomSelectMenu,
    customSelectOptionId,
    type CustomSelectMenuPosition,
    type CustomSelectOption,
} from './CustomSelectMenu';
import { useCustomSelectNavigation } from './useCustomSelectNavigation';

// CustomSelect.tsx
// A custom dropdown select component designed to replace the browser's default select element.
// Styled to match the rest of the application, handling light/dark mode and dynamic themes.
//
// 为 Folium 表单（#485）加的几处。新参数（size / triggerClassName / triggerStyle / ariaLabelledBy）
// 不传时外观和标记不变；但开合与键盘这一组行为对全仓所有用法都生效，没有开关，改动时要逐处想到：
// - 开合、外部点击收起与键盘操作在 useCustomSelectNavigation，监听都挂在捕获阶段：
//   · 外部点击改在捕获阶段判定（容器拦了 mousedown 冒泡也照样收起）；
//   · 菜单开着时 Escape 只关菜单并 stopPropagation，外层（命令面板、设置弹窗）收不到这一次 Escape；
//   · 焦点移到触发按钮和菜单以外即收起；
//   · ↑↓ / Home / End 移动高亮、Enter 选中高亮项、Tab 收起；高亮停在当前值上按 Enter 只收起，
//     不调用 onChange（鼠标点当前项仍照旧调用）；
//   · 高亮按值记，onOpen 里懒加载选项、菜单开着选项变了，高亮仍在原来那一项上；
//   · 菜单关着时，焦点在触发按钮上按 ↑↓ / Enter 会 preventDefault + stopPropagation 并打开菜单——
//     原先焦点停在按钮上按 ↓ 会滚动页面（例如设置页），现在改成打开下拉；用键盘（含空格）打开时
//     把当前项滚进视野，鼠标打开不滚。
// - 触发按钮是 select-only combobox：role=combobox，aria-controls 指向列表，aria-activedescendant
//   指向高亮项，焦点不离开按钮，读屏也能逐项听到 ↑↓ 移到了哪一项（原先只是底色在变，读屏什么也
//   听不到）。Chromium 把按钮内容报成 combobox 的值；但 combobox 不从内容取名字，所以既没有
//   ariaLabel 也没有 ariaLabelledBy 时，按钮由显示值的 span 命名，和原先按钮读内容一样。
// - size="compact"：触发按钮与 Folium 表单的文本框（px-2.5 py-1.5 text-xs，约 30px）同高。
// - triggerClassName / triggerStyle：由调用方接管触发按钮的底色与描边。默认用的 --overlay-medium、
//   --border-color 在 src 里都没有定义（底色实际透明，描边退成 currentColor），Folium 表单要和
//   旁边的输入框一致，就把表单 token 里输入框的 class / style 原样传进来。
// - ariaLabelledBy：触发按钮改由这些 id（例如字段的可见标签）加上按钮里显示值的 span 命名，读屏读出
//   「字段名 当前值」，与原生 select 的名字 + 值相当。只给 ariaLabel 时按钮名字只有 ariaLabel，
//   当前值只能靠 combobox 的值报出。
// - placeholder 缺省走 i18n（ui.selectPlaceholder），不再写死英文 'Select...'——同样对所有用法生效。

interface CustomSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: CustomSelectOption[];
    /** Fired right before the menu opens, so callers can populate `options` on first demand. */
    onOpen?: () => void;
    placeholder?: string;
    /** Names the trigger and the menu. With `ariaLabelledBy` it names only the menu. */
    ariaLabel?: string;
    /**
     * Space-separated ids of the elements that name the trigger, such as a visible field label.
     * The trigger's own value text is appended, so a screen reader announces the field and its
     * current choice, as with a native select; `ariaLabel` alone would hide the value.
     */
    ariaLabelledBy?: string;
    disabled?: boolean;
    isDaylight?: boolean;
    theme?: Theme;
    /** Trigger density. `compact` lines up with the 30px text fields of Folium forms. */
    size?: 'default' | 'compact';
    /** Extra trigger classes. With this or `triggerStyle`, the trigger's background and border colour belong to the caller. */
    triggerClassName?: string;
    /** Inline trigger style, merged over the text colour (see `triggerClassName`). */
    triggerStyle?: React.CSSProperties;
}

const DROPDOWN_GAP = 4;
const DROPDOWN_VIEWPORT_GUTTER = 8;
const DROPDOWN_MAX_HEIGHT = 240;
const DROPDOWN_MIN_PREFERRED_HEIGHT = 160;

const TRIGGER_BASE_CLASS = 'w-full flex items-center justify-between border transition-all focus:outline-none disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer';
const TRIGGER_SIZE_CLASS: Record<NonNullable<CustomSelectProps['size']>, string> = {
    default: 'rounded-xl px-4 py-3 text-sm',
    compact: 'gap-1.5 rounded-lg px-2.5 py-1.5 text-xs min-w-0',
};
const CHEVRON_SIZE: Record<NonNullable<CustomSelectProps['size']>, number> = { default: 16, compact: 14 };

export const CustomSelect: React.FC<CustomSelectProps> = ({
    value,
    onChange,
    options,
    onOpen,
    placeholder,
    ariaLabel,
    ariaLabelledBy,
    disabled = false,
    isDaylight = false,
    theme,
    size = 'default',
    triggerClassName,
    triggerStyle,
}) => {
    const { t } = useTranslation();
    const [dropdownPosition, setDropdownPosition] = useState<CustomSelectMenuPosition | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const baseId = useId();
    const valueId = `${baseId}value`;
    const listboxId = `${baseId}listbox`;
    const {
        isOpen,
        activeIndex,
        followActive,
        select,
        activateFromPointer,
        releasePointer,
        handleTriggerClick,
        handleTriggerKeyDown,
    } = useCustomSelectNavigation({ options, value, disabled, onOpen, onChange, containerRef, menuRef, triggerRef });

    // Positions the portaled menu against the trigger and flips it when viewport space is limited.
    const updateDropdownPosition = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom - DROPDOWN_GAP - DROPDOWN_VIEWPORT_GUTTER;
        const spaceAbove = rect.top - DROPDOWN_GAP - DROPDOWN_VIEWPORT_GUTTER;
        const useViewportPlacement = Math.max(spaceAbove, spaceBelow) < DROPDOWN_MIN_PREFERRED_HEIGHT;
        const placement: CustomSelectMenuPosition['placement'] = useViewportPlacement
            ? 'viewport'
            : spaceBelow < DROPDOWN_MIN_PREFERRED_HEIGHT && spaceAbove > spaceBelow
                ? 'top'
                : 'bottom';
        const availableHeight = placement === 'viewport'
            ? window.innerHeight - DROPDOWN_VIEWPORT_GUTTER * 2
            : placement === 'top'
                ? spaceAbove
                : spaceBelow;
        const width = Math.min(rect.width, window.innerWidth - DROPDOWN_VIEWPORT_GUTTER * 2);
        const left = Math.max(
            DROPDOWN_VIEWPORT_GUTTER,
            Math.min(rect.left, window.innerWidth - width - DROPDOWN_VIEWPORT_GUTTER),
        );

        setDropdownPosition({
            left,
            width,
            maxHeight: Math.max(
                72,
                placement === 'viewport'
                    ? availableHeight
                    : Math.min(DROPDOWN_MAX_HEIGHT, availableHeight),
            ),
            placement,
            ...(placement === 'viewport'
                ? { top: DROPDOWN_VIEWPORT_GUTTER }
                : placement === 'top'
                ? { bottom: window.innerHeight - rect.top + DROPDOWN_GAP }
                : { top: rect.bottom + DROPDOWN_GAP }),
        });
    }, []);

    useLayoutEffect(() => {
        if (!isOpen) {
            setDropdownPosition(null);
            return;
        }

        updateDropdownPosition();
        window.addEventListener('resize', updateDropdownPosition);
        window.addEventListener('scroll', updateDropdownPosition, true);
        return () => {
            window.removeEventListener('resize', updateDropdownPosition);
            window.removeEventListener('scroll', updateDropdownPosition, true);
        };
    }, [isOpen, updateDropdownPosition]);

    const selectedOption = options.find((opt) => opt.value === value);
    // 列表真正挂出来以后（dropdownPosition 在打开后的布局阶段才算好）才让触发按钮指向它和它的选项。
    const isMenuShown = isOpen && dropdownPosition !== null;
    // combobox 不从内容取名字：调用方什么名字都没给时，用显示值命名，和原先按钮读内容一样。
    const triggerLabelledBy = ariaLabelledBy
        ? `${ariaLabelledBy} ${valueId}`
        : ariaLabel ? undefined : valueId;
    const accentColor = theme?.accentColor || (isDaylight ? '#44403c' : '#f4f4f5');
    // The menu is portaled to document.body, so it cannot inherit the app container's theme variables.
    const textColor = theme?.primaryColor || (isDaylight ? '#1c1917' : '#f4f4f5');
    const borderColor = isDaylight ? 'rgba(28, 25, 23, 0.14)' : 'rgba(244, 244, 245, 0.14)';
    const openRing = isOpen ? `0 0 0 1px ${accentColor}` : undefined;
    // 调用方接管底色与描边时不再写 borderColor：它的 style 可能用 border 简写，混用会被 React 警告。
    const callerOwnsSurface = triggerClassName !== undefined || triggerStyle !== undefined;
    const triggerInlineStyle: React.CSSProperties = callerOwnsSurface
        ? { color: 'var(--text-primary)', ...triggerStyle, boxShadow: openRing ?? triggerStyle?.boxShadow }
        : {
            backgroundColor: 'var(--overlay-medium)',
            borderColor: isOpen ? accentColor : 'var(--border-color)',
            color: 'var(--text-primary)',
            boxShadow: openRing,
        };

    return (
        <div ref={containerRef} className="relative w-full">
            <button
                ref={triggerRef}
                type="button"
                role="combobox"
                onClick={handleTriggerClick}
                onKeyDown={handleTriggerKeyDown}
                disabled={disabled}
                aria-label={ariaLabelledBy ? undefined : ariaLabel}
                aria-labelledby={triggerLabelledBy}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={isMenuShown ? listboxId : undefined}
                aria-activedescendant={isMenuShown && activeIndex >= 0 ? customSelectOptionId(listboxId, activeIndex) : undefined}
                className={`${TRIGGER_BASE_CLASS} ${TRIGGER_SIZE_CLASS[size]}${triggerClassName ? ` ${triggerClassName}` : ''}`}
                style={triggerInlineStyle}
            >
                <span id={triggerLabelledBy ? valueId : undefined} className="truncate">
                    {selectedOption ? selectedOption.label : (placeholder ?? t('ui.selectPlaceholder'))}
                </span>
                <ChevronDown
                    size={CHEVRON_SIZE[size]}
                    className={`transition-transform duration-200 shrink-0 opacity-70 ${isOpen ? 'rotate-180' : ''}`}
                    style={{ color: 'var(--text-secondary)' }}
                />
            </button>

            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isOpen && dropdownPosition && (
                        <CustomSelectMenu
                            menuRef={menuRef}
                            listboxId={listboxId}
                            position={dropdownPosition}
                            options={options}
                            value={value}
                            ariaLabel={ariaLabel}
                            ariaLabelledBy={ariaLabel ? undefined : ariaLabelledBy}
                            isDaylight={isDaylight}
                            accentColor={accentColor}
                            textColor={textColor}
                            borderColor={borderColor}
                            activeIndex={activeIndex}
                            followActive={followActive}
                            onActivate={activateFromPointer}
                            onPointerLeave={releasePointer}
                            onSelect={select}
                        />
                    )}
                </AnimatePresence>,
                document.body,
            )}
        </div>
    );
};

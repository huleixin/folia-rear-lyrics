import React, { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { List, useListRef, type RowComponentProps } from 'react-window';

// CustomSelectMenu.tsx
// Renders the viewport-anchored option menu used by CustomSelect.
//
// 选项超过 VIRTUALIZE_THRESHOLD 时改走 react-window。命令面板的固定命令设置和自定义快捷键
// 选择器各要铺约 125 条命令，是仓库里最长的两个下拉；其余三十来个下拉只有 2-8 项，走原来的
// 分支，标记除了读屏要用的选项 id 之外不变，不承担任何风险。
//
// 高度策略：**不引入任何新测量**。虚拟化分支消费的是 CustomSelect.updateDropdownPosition
// 已经算好的 position.maxHeight（开合与 resize/scroll 时更新），只是把它减去内边距当成列表高度。
//
// 高亮项（activeIndex）由 CustomSelect 的 useCustomSelectNavigation 持有：指针移动和 ↑↓ 都改它，
// 两个分支的底色都从它渲染（原先是 onMouseEnter/Leave 直接改 style，视觉相同）。只有键盘移动或
// 用键盘打开（followActive）才把高亮项滚进视野，指针高亮不滚，免得列表在鼠标下面跑。
//
// 读屏：焦点一直留在触发按钮（role=combobox）上，由它的 aria-activedescendant 指向高亮项，所以每个
// 选项都有由 listboxId 和下标拼成的 id（customSelectOptionId，两个分支一样）。虚拟化分支里
// react-window 的容器默认是 role=list，夹在 listbox 和 option 之间会断开归属，这里改成 presentation；
// 没渲染出来的行由 aria-setsize / aria-posinset 补上「第几项，共几项」。

export interface CustomSelectOption {
    value: string;
    label: string;
}

export interface CustomSelectMenuPosition {
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
    placement: 'top' | 'bottom' | 'viewport';
}

/** 选项的 DOM id：触发按钮的 aria-activedescendant 用它指向高亮项。 */
export const customSelectOptionId = (listboxId: string, index: number) => `${listboxId}-option-${index}`;

interface CustomSelectMenuProps {
    menuRef: React.RefObject<HTMLDivElement | null>;
    /** 列表的 id：触发按钮的 aria-controls 指向它，选项的 id 也由它派生。 */
    listboxId: string;
    position: CustomSelectMenuPosition;
    options: CustomSelectOption[];
    value: string;
    ariaLabel?: string;
    /** Names the listbox when there is no `ariaLabel`. */
    ariaLabelledBy?: string;
    isDaylight: boolean;
    accentColor: string;
    textColor: string;
    borderColor: string;
    /** 高亮项下标，-1 表示没有。 */
    activeIndex: number;
    /** 高亮来自键盘：要把它滚进视野。 */
    followActive: boolean;
    /** 指针移到某个选项上，参数是它的值。 */
    onActivate: (value: string) => void;
    onPointerLeave: () => void;
    onSelect: (value: string) => void;
}

const VIRTUALIZE_THRESHOLD = 24;
/** px-3 py-2.5 text-sm：10 + 20 + 10。 */
const OPTION_ROW_HEIGHT = 40;
/** 对应 space-y-0.5。虚拟化分支里改成行容器的下内边距，视觉一致。 */
const OPTION_ROW_GAP = 2;
/** p-1.5，上下各 6。 */
const MENU_PADDING = 12;
/** 菜单刚挂上时 react-window 的容器元素可能还没登记到 listRef，最多再等这么多帧。 */
const LIST_READY_MAX_FRAMES = 5;

type OptionRowProps = {
    listboxId: string;
    options: CustomSelectOption[];
    value: string;
    activeIndex: number;
    isDaylight: boolean;
    accentColor: string;
    textColor: string;
    onActivate: (value: string) => void;
    onSelect: (value: string) => void;
};

// 选中项用强调色底；高亮（悬停或键盘）的非选中项用原先的悬停底色。
const optionBackground = (isSelected: boolean, isActive: boolean, isDaylight: boolean, accentColor: string) => {
    if (isSelected) return isDaylight ? `${accentColor}12` : `${accentColor}18`;
    if (isActive) return isDaylight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.06)';
    return 'transparent';
};

const OptionButton: React.FC<{
    id: string;
    option: CustomSelectOption;
    index: number;
    /** 虚拟化分支：选项总数，与 index 一起写成 aria-setsize / aria-posinset。 */
    setSize?: number;
    isSelected: boolean;
    isActive: boolean;
    isDaylight: boolean;
    accentColor: string;
    textColor: string;
    fixedHeight?: number;
    onActivate: (value: string) => void;
    onSelect: (value: string) => void;
}> = ({ id, option, index, setSize, isSelected, isActive, isDaylight, accentColor, textColor, fixedHeight, onActivate, onSelect }) => (
    <button
        type="button"
        id={id}
        role="option"
        aria-selected={isSelected}
        aria-setsize={setSize}
        aria-posinset={setSize === undefined ? undefined : index + 1}
        data-option-index={index}
        data-active={isActive ? 'true' : undefined}
        onClick={() => onSelect(option.value)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-lg transition-colors text-left cursor-pointer"
        style={{
            color: textColor,
            backgroundColor: optionBackground(isSelected, isActive, isDaylight, accentColor),
            ...(fixedHeight ? { height: fixedHeight, paddingTop: 0, paddingBottom: 0 } : {}),
        }}
        // mousemove 而不是 mouseenter：键盘把列表滚动后，停着不动的指针下面换了一行，不该把高亮抢走。
        onMouseMove={isActive ? undefined : () => onActivate(option.value)}
    >
        <span className="truncate mr-2">{option.label}</span>
        {isSelected && (
            <Check
                size={14}
                className="shrink-0"
                style={{ color: accentColor }}
            />
        )}
    </button>
);

const CustomSelectMenuRow = ({
    index,
    style,
    listboxId,
    options,
    value,
    activeIndex,
    isDaylight,
    accentColor,
    textColor,
    onActivate,
    onSelect,
}: RowComponentProps<OptionRowProps>): React.ReactElement | null => {
    const option = options[index];
    if (!option) {
        return null;
    }

    return (
        <div style={{ ...style, paddingBottom: OPTION_ROW_GAP }}>
            <OptionButton
                id={customSelectOptionId(listboxId, index)}
                option={option}
                index={index}
                setSize={options.length}
                isSelected={option.value === value}
                isActive={index === activeIndex}
                isDaylight={isDaylight}
                accentColor={accentColor}
                textColor={textColor}
                fixedHeight={OPTION_ROW_HEIGHT}
                onActivate={onActivate}
                onSelect={onSelect}
            />
        </div>
    );
};

export const CustomSelectMenu: React.FC<CustomSelectMenuProps> = ({
    menuRef,
    listboxId,
    position,
    options,
    value,
    ariaLabel,
    ariaLabelledBy,
    isDaylight,
    accentColor,
    textColor,
    borderColor,
    activeIndex,
    followActive,
    onActivate,
    onPointerLeave,
    onSelect,
}) => {
    const isVirtualized = options.length >= VIRTUALIZE_THRESHOLD;
    const listRef = useListRef(null);

    const rowProps = useMemo(() => ({
        listboxId,
        options,
        value,
        activeIndex,
        isDaylight,
        accentColor,
        textColor,
        onActivate,
        onSelect,
    }), [listboxId, options, value, activeIndex, isDaylight, accentColor, textColor, onActivate, onSelect]);

    // 键盘移动高亮、或用键盘打开菜单后，把高亮项滚进视野（就近对齐，已经看得见就不动）。
    useEffect(() => {
        if (!followActive || activeIndex < 0 || activeIndex >= options.length) return undefined;
        if (!isVirtualized) {
            const row = menuRef.current?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`);
            row?.scrollIntoView?.({ block: 'nearest' });
            return undefined;
        }
        // react-window 把容器元素记在自己的 state 里，菜单刚挂上的这一轮里 listRef 可能还拿不到
        // 元素（scrollToRow 会什么都不做）；那就等下一帧再滚，用键盘打开长列表时当前项才看得见。
        let frame = 0;
        let framesLeft = LIST_READY_MAX_FRAMES;
        const scrollToActive = () => {
            const list = listRef.current;
            if (list?.element) {
                list.scrollToRow({ index: activeIndex, align: 'auto' });
            } else if (framesLeft > 0) {
                framesLeft -= 1;
                frame = requestAnimationFrame(scrollToActive);
            }
        };
        scrollToActive();
        return () => cancelAnimationFrame(frame);
    }, [activeIndex, followActive, isVirtualized, listRef, menuRef, options.length]);

    const listHeight = Math.max(
        OPTION_ROW_HEIGHT,
        Math.min(
            position.maxHeight - MENU_PADDING,
            options.length * (OPTION_ROW_HEIGHT + OPTION_ROW_GAP) - OPTION_ROW_GAP,
        ),
    );

    return (
        <motion.div
            ref={menuRef}
            initial={{
                opacity: 0,
                y: position.placement === 'top' ? 8 : -8,
                scale: 0.96,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
                opacity: 0,
                y: position.placement === 'top' ? 8 : -8,
                scale: 0.96,
            }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`fixed z-[200] rounded-xl border shadow-xl overscroll-contain backdrop-blur-md custom-scrollbar${isVirtualized ? '' : ' overflow-y-auto'}`}
            data-wheel-scroll-region
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            onMouseLeave={onPointerLeave}
            style={{
                left: position.left,
                top: position.top,
                bottom: position.bottom,
                width: position.width,
                maxHeight: position.maxHeight,
                backgroundColor: isDaylight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(24, 24, 27, 0.96)',
                borderColor,
                color: textColor,
            }}
        >
            {isVirtualized ? (
                <div className="p-1.5">
                    <List
                        listRef={listRef}
                        role="presentation"
                        rowCount={options.length}
                        rowHeight={OPTION_ROW_HEIGHT + OPTION_ROW_GAP}
                        rowComponent={CustomSelectMenuRow}
                        rowProps={rowProps}
                        overscanCount={4}
                        className="custom-scrollbar"
                        style={{ height: listHeight, width: '100%' }}
                    />
                </div>
            ) : (
                <div className="p-1.5 space-y-0.5">
                    {options.map((option, index) => (
                        <OptionButton
                            key={option.value}
                            id={customSelectOptionId(listboxId, index)}
                            option={option}
                            index={index}
                            isSelected={option.value === value}
                            isActive={index === activeIndex}
                            isDaylight={isDaylight}
                            accentColor={accentColor}
                            textColor={textColor}
                            onActivate={onActivate}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}
        </motion.div>
    );
};

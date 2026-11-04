import React from 'react';
import { useTranslation } from 'react-i18next';
import { resolvePlayerControlSlot, type PlayerControlSlotActionId, type PlayerControlSlotContext } from './playerControlSlotActions';
import PlayerControlIcon from '../app/icons/PlayerControlIcon';

// src/components/floating-player/PlayerControlSlotButton.tsx
// 进度条胶囊右侧的一个可自定义槽位。样式沿用原来写死的循环 / 歌词时间轴按钮。

interface PlayerControlSlotButtonProps {
    actionId: PlayerControlSlotActionId;
    context: PlayerControlSlotContext;
    primaryColor: string;
    isDaylight?: boolean;
    /** 定位模式或播放源不可控时，整排按钮一起失效。 */
    controlsDisabled?: boolean;
    className?: string;
}

const PlayerControlSlotButton: React.FC<PlayerControlSlotButtonProps> = ({
    actionId,
    context,
    primaryColor,
    isDaylight,
    controlsDisabled = false,
    className = '',
}) => {
    const { t } = useTranslation();
    const slot = resolvePlayerControlSlot(actionId, context);
    const disabled = slot.disabled || controlsDisabled;
    const label = t(slot.labelKey);
    // 播放控制类槽位用听屿图标包几何；激活态（循环非 off）用薄荷绿。
    const mint = isDaylight ? '#3e9c88' : '#6dbdad';
    const iconColor = slot.active && slot.pack ? mint : primaryColor;

    // 三段视觉：已开启（循环非 off / 已喜爱）高亮，不可用压暗，其余是低透明度的常态。
    const stateClass = disabled
        ? 'cursor-not-allowed opacity-20'
        : slot.active
            ? (isDaylight ? 'bg-black/10 text-black' : 'bg-white/20')
            : `opacity-40 hover:opacity-100 ${isDaylight ? 'hover:bg-black/5' : 'hover:bg-white/10'}`;

    return (
        <button
            type="button"
            // 思索教程按它认这个槽位放的是哪个动作。纯标记，不参与任何行为。
            data-ponder-slot={actionId}
            data-folia-player-bar-slot="true"
            onClick={(e) => {
                e.stopPropagation();
                if (disabled) {
                    return;
                }
                slot.onActivate();
            }}
            disabled={disabled}
            className={`rounded-full p-2 transition-colors ${stateClass} ${className}`}
            style={{ color: iconColor }}
            title={label}
            aria-label={label}
        >
            {slot.pack ? (
                <PlayerControlIcon
                    kind={slot.pack}
                    size={20}
                    className="sm:h-[18px] sm:w-[18px]"
                />
            ) : (
                slot.icon && (
                    <slot.icon
                        size={20}
                        className="sm:h-[18px] sm:w-[18px]"
                        fill={slot.filled ? 'currentColor' : 'none'}
                    />
                )
            )}
        </button>
    );
};

export default PlayerControlSlotButton;

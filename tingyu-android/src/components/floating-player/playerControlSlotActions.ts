import { ChartBar, Heart, PanelsTopLeft, Timer, Volume2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PlayerControlSlotActionId } from '../../types/playerControlSlots';
import { noteLoopButtonPress } from '../../services/ponder/loopShuffleHint';

// src/components/floating-player/playerControlSlotActions.ts
// 进度条胶囊右侧两个可自定义槽位的动作清单。
//
// 仓库里没有中心化的播放动作注册表，最接近的是 command palette 的 playbackCommands；
// 这里只登记「已有图标 + 已有 handler」的播放相关动作，图标沿用那些命令自己声明的那一个。
// 会打开界面的动作不去碰侧边面板 tab，而是复用命令面板的 surface（音量滑块、队列列表等）。
// id 和默认值本身是跨层合同，放在 src/types/playerControlSlots.ts。

export type { PlayerControlSlotActionId };

/** 槽位渲染所需的全部输入；由 buildAppOverlaysModel 组装，全部来自已有 handler。 */
export type PlayerControlSlotContext = {
    loopMode: 'off' | 'all' | 'one';
    onToggleLoop: () => void;
    onPrev: () => void;
    onNext: () => void;
    canPrev: boolean;
    canNext: boolean;
    onShuffle: () => void;
    canShuffle: boolean;
    onLike: () => void;
    isLiked: boolean;
    likeDisabled: boolean;
    onToggleTimeline: () => void;
    hasLyrics: boolean;
    /**
     * 命令面板的 invokeCommandById：带 surface 的打开面板，不带的直接执行。
     * 打开界面的槽位全部走它，而不是自己去开侧边面板 tab。
     */
    invokeCommandById: (commandId: string) => void;
    /**
     * 该命令此刻能不能用。必须和命令面板同一套判断 —— 否则 Personal FM 里
     * 面板已经把队列命令藏起来了，槽位却还能点开它。
     */
    canInvokeCommandById: (commandId: string) => boolean;
};

/** 单个槽位算出来的渲染结果。 */
export type ResolvedPlayerControlSlot = {
    /** 听屿图标包的 kind（第 20 轮）：播放控制类槽位用图标包几何。 */
    pack?: string;
    /** 非播放控制类的 lucide 图标（喜爱/音量/计时器等不在图标包语义内）。 */
    icon: LucideIcon | null;
    /** 图标是否填充（目前只有「喜爱」用得上）。 */
    filled: boolean;
    /** 是否处于「已开启」的高亮态（循环非 off、已喜爱）。 */
    active: boolean;
    disabled: boolean;
    onActivate: () => void;
    labelKey: string;
};

/** 设置下拉里的静态展示项：图标固定取一个代表态，不需要运行时状态。 */
export const PLAYER_CONTROL_SLOT_OPTIONS: readonly { id: PlayerControlSlotActionId; pack?: string; labelKey: string; }[] = [
    { id: 'loop', pack: 'all', labelKey: 'options.playerControlSlotAction_loop' },
    { id: 'prev', pack: 'previous', labelKey: 'options.playerControlSlotAction_prev' },
    { id: 'next', pack: 'next', labelKey: 'options.playerControlSlotAction_next' },
    { id: 'shuffle', pack: 'shuffle', labelKey: 'options.playerControlSlotAction_shuffle' },
    { id: 'like', labelKey: 'options.playerControlSlotAction_like' },
    { id: 'lyrics-timeline', labelKey: 'options.playerControlSlotAction_lyricsTimeline' },
    { id: 'volume', labelKey: 'options.playerControlSlotAction_volume' },
    { id: 'queue', pack: 'queue', labelKey: 'options.playerControlSlotAction_queue' },
    { id: 'song-wall', labelKey: 'options.playerControlSlotAction_songWall' },
    { id: 'sleep-timer', labelKey: 'options.playerControlSlotAction_sleepTimer' },
];

/** 循环按钮的图标反映当前模式，是这批动作里唯一的三态图标（off 即顺序播放）。 */
const resolveLoopPack = (loopMode: PlayerControlSlotContext['loopMode']): string => {
    if (loopMode === 'off') return 'order';
    if (loopMode === 'one') return 'one';
    return 'all';
};

/** 循环按钮的提示文本反映当前模式。 */
const resolveLoopLabelKey = (loopMode: PlayerControlSlotContext['loopMode']): string => {
    if (loopMode === 'off') return 'player.loopOff';
    if (loopMode === 'one') return 'player.loopOne';
    return 'player.loopAll';
};

/**
 * 把一个槽位 id 和当前播放上下文解析成可直接渲染的按钮描述。
 * 打开界面的四个动作统一转成 openCommandById，复用命令面板已经做好的 surface。
 */
export const resolvePlayerControlSlot = (
    id: PlayerControlSlotActionId,
    context: PlayerControlSlotContext,
): ResolvedPlayerControlSlot => {
    switch (id) {
        case 'loop':
            return {
                pack: resolveLoopPack(context.loopMode),
                icon: null,
                filled: false,
                active: context.loopMode !== 'off',
                disabled: false,
                onActivate: () => {
                    // 切循环本身会弹一条模式提示，这一条要在它之后才盖得住。
                    context.onToggleLoop();
                    noteLoopButtonPress();
                },
                labelKey: resolveLoopLabelKey(context.loopMode),
            };
        case 'prev':
            return {
                pack: 'previous',
                icon: null,
                filled: false,
                active: false,
                disabled: !context.canPrev,
                onActivate: context.onPrev,
                labelKey: 'options.playerControlSlotAction_prev',
            };
        case 'next':
            return {
                pack: 'next',
                icon: null,
                filled: false,
                active: false,
                disabled: !context.canNext,
                onActivate: context.onNext,
                labelKey: 'options.playerControlSlotAction_next',
            };
        case 'shuffle':
            return {
                pack: 'shuffle',
                icon: null,
                filled: false,
                active: false,
                disabled: !context.canShuffle,
                onActivate: context.onShuffle,
                labelKey: 'options.playerControlSlotAction_shuffle',
            };
        case 'like':
            return {
                icon: Heart,
                filled: context.isLiked,
                active: context.isLiked,
                disabled: context.likeDisabled,
                onActivate: context.onLike,
                labelKey: 'options.playerControlSlotAction_like',
            };
        case 'volume':
            return {
                icon: Volume2,
                filled: false,
                active: false,
                disabled: !context.canInvokeCommandById('playback-volume'),
                onActivate: () => context.invokeCommandById('playback-volume'),
                labelKey: 'options.playerControlSlotAction_volume',
            };
        case 'queue':
            return {
                pack: 'queue',
                icon: null,
                filled: false,
                active: false,
                disabled: !context.canInvokeCommandById('queue'),
                onActivate: () => context.invokeCommandById('queue'),
                labelKey: 'options.playerControlSlotAction_queue',
            };
        case 'song-wall':
            return {
                icon: PanelsTopLeft,
                filled: false,
                active: false,
                // The command hides itself on the wall, so the slot greys out there instead of
                // offering a trip to the surface the user is already looking at.
                disabled: !context.canInvokeCommandById('navigate-lattice'),
                onActivate: () => context.invokeCommandById('navigate-lattice'),
                labelKey: 'options.playerControlSlotAction_songWall',
            };
        case 'sleep-timer':
            return {
                icon: Timer,
                filled: false,
                active: false,
                disabled: !context.canInvokeCommandById('sleep-timer'),
                onActivate: () => context.invokeCommandById('sleep-timer'),
                labelKey: 'options.playerControlSlotAction_sleepTimer',
            };
        case 'lyrics-timeline':
        default:
            return {
                icon: ChartBar,
                filled: false,
                active: false,
                disabled: !context.hasLyrics,
                onActivate: context.onToggleTimeline,
                labelKey: 'options.playerControlSlotAction_lyricsTimeline',
            };
    }
};

import { PlayerState, type SongResult, type StatusMessage } from '../../../types';
import type { SkipPromptMessageKey } from '../../../types/appPlayback';
import type { PlaybackFailure, PlaybackFailureContext } from '../../../types/playbackFailure';
import type { StatusSetter } from '../../../stores/useStatusMessageStore';
import { buildPlaybackFailureStatus, resolvePlaybackFailurePolicy } from '../../../services/playbackRecovery/playbackFailurePolicy';
import type { PlaybackFailedNotice } from '../../../services/hostExtensionHooks';

// src/components/app/playback/presentPlaybackFailure.ts
// 播放失败的展示层：按策略表决定倒计时跳歌、停播，还是给出带“重试 / 跳过”的常驻消息；倒计时被取消时退回该原因原本的停播与按钮。
// 只负责展示和停播，不决定原因；队列控制器在点歌失败和播放中失败时都交给这里。
// 「无法播放时自动跳过」设置经 deps 的 getter 在展示那一刻读取，策略模块本身保持纯函数。
// 展示完（消息或倒计时已写入）后经 deps.notifyFailure 报告一次失败（Folium 的 playback.failed），陈旧请求不报。

export interface PlaybackFailurePresentation {
    failure: PlaybackFailure;
    /** 失败的那首歌：点歌时是请求的那首（不一定是正在显示的），播放中失败时是当前歌曲。只用于报告。 */
    song: SongResult | null;
    context: PlaybackFailureContext;      // 'play' | 'mid-playback'
    isCurrent: () => boolean;
    skipCount: number;
    retry?: () => void;
    skip?: () => void;                    // 没有下一首可播歌曲时为 undefined
}

export interface PlaybackFailurePresenterDeps {
    t: (key: string, options?: Record<string, unknown>) => string;
    setStatusMsg: StatusSetter;
    setPlayerState: (state: PlayerState) => void;
    audioRef: { current: { pause(): void } | null };
    shouldAutoPlayRef: { current: boolean };
    setIsLyricsLoading: (value: boolean) => void;
    /** 倒计时跳歌；onCancel 在用户点「取消」、倒计时收起之后调用。 */
    showTimedSkipPrompt: (key: SkipPromptMessageKey, onSkip: () => void, onCancel?: () => void) => void;
    maxAutoSkipCount: number;
    /** 「无法播放时自动跳过」设置；每次展示时调用读取，deps 被 useMemo 缓存也拿得到最新值。 */
    getAutoSkipUnplayable: () => boolean;
    /** 报告一次用户看得到的失败（hostExtensionHooks.notifyPlaybackFailed）；在界面状态写完之后调用。 */
    notifyFailure: (notice: PlaybackFailedNotice) => void;
}

/** 按策略表展示一次失败：倒计时跳歌、停播提示或带按钮的持久消息。陈旧请求直接忽略。 */
export const presentPlaybackFailure = (input: PlaybackFailurePresentation, deps: PlaybackFailurePresenterDeps): void => {
    const { failure, song, context, isCurrent, skipCount, retry, skip } = input;
    if (!isCurrent()) return;

    const policy = resolvePlaybackFailurePolicy(failure, context, { autoSkipUnplayable: deps.getAutoSkipUnplayable() });
    deps.setIsLyricsLoading(false);

    // 该原因原本的处理：按策略停播，再给出它自己的消息与按钮。不倒计时时直接走这里，倒计时被取消时也退回这里。
    const showReasonMessage = () => {
        if (policy.stopPlayback) {
            deps.shouldAutoPlayRef.current = false;
            deps.audioRef.current?.pause();
            deps.setPlayerState(context === 'mid-playback' ? PlayerState.PAUSED : PlayerState.IDLE);
        }

        // 按钮可能在用户切歌之后才被点：先确认仍是这次请求，再清掉消息、执行动作。
        // 陈旧时不执行动作，但仍收起这条常驻消息（只收起自己那条，期间换上的新消息不动），否则它关不掉。
        let built: StatusMessage | null = null;
        const wrap = (action?: () => void) => action && (() => {
            if (!isCurrent()) {
                deps.setStatusMsg(current => (current === built ? null : current));
                return;
            }
            deps.setStatusMsg(null);
            action();
        });

        built = buildPlaybackFailureStatus(policy, deps.t, {
            retry: wrap(retry),
            skip: wrap(skip),
            dismiss: () => deps.setStatusMsg(null),
        });
        deps.setStatusMsg(built);
    };

    // 只有 taken-down 会走到倒计时；次数用尽或没有下一首时落到下面的普通消息。
    // 「无法播放时自动跳过」打开时受限类与原因不明也走这里；次数用尽时同样落到下面，用该原因原本的消息与按钮。
    if (policy.autoSkip === 'countdown' && policy.countdownKey && skip && skipCount < deps.maxAutoSkipCount) {
        // 用户点「取消」就是这次不跳：退回该原因原本的停播与按钮，和设置关闭时一样。否则播放中失败会停在 PLAYING
        // （出错的 deck 的 pause 事件被忽略），「重试」这个唯一的强制刷新入口也没了。taken-down 原本既不停播也没有按钮，
        // 取消照旧只收起倒计时。取消后不再报告：倒计时出现时已经报过一次。
        const onCancel = policy.stopPlayback || policy.actions.length > 0
            ? () => { if (isCurrent()) showReasonMessage(); }
            : undefined;
        deps.showTimedSkipPrompt(policy.countdownKey, () => {
            if (isCurrent()) skip();
        }, onCancel);
        deps.notifyFailure({ song, reason: failure.reason, phase: context, willAutoSkip: true });
        return;
    }

    showReasonMessage();
    deps.notifyFailure({ song, reason: failure.reason, phase: context, willAutoSkip: false });
};

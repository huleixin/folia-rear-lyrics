import { describe, expect, it, vi } from 'vitest';
import {
    PLAYBACK_FAILURE_ACTION_LABEL_KEYS,
    PLAYBACK_FAILURE_MESSAGE_KEYS,
    PLAYBACK_FAILURE_POLICY,
    PLAYBACK_RETRYING_MESSAGE_KEY,
    UNPLAYABLE_SKIP_PROMPT_KEY,
    buildPlaybackFailureStatus,
    getPlaybackFailureMessage,
    isAutoSkipFailure,
    isPlaybackFailureStatus,
    resolvePlaybackFailurePolicy,
    sleepForPlaybackRetry,
} from '@/services/playbackRecovery/playbackFailurePolicy';
import type { PlaybackFailure, PlaybackFailurePolicy, PlaybackFailureReason } from '@/types/playbackFailure';

// test/unit/playback/playbackFailurePolicy.test.ts
// 策略表逐行锁定：只有 taken-down 会倒计时跳歌和提供替代版本，其余原因都保留队列。
// 「无法播放时自动跳过」打开时的覆盖另有一张全表（受限类与原因不明加倒计时）。

const failure = (reason: PlaybackFailureReason, extra: Partial<PlaybackFailure> = {}): PlaybackFailure => ({
    reason,
    stage: 'resolve-url',
    ...extra,
});

const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key);

type Row = [PlaybackFailureReason, Pick<PlaybackFailurePolicy, 'messageKey' | 'stopPlayback' | 'autoSkip' | 'actions' | 'autoRetryDelaysMs' | 'cooldown' | 'offerReplacement'>];

const TABLE: Row[] = [
    ['not-signed-in', { messageKey: 'status.songLoginRequired', stopPlayback: true, autoSkip: 'none', actions: ['skip'], autoRetryDelaysMs: [], cooldown: null, offerReplacement: false }],
    ['session-expired', { messageKey: 'status.loginExpired', stopPlayback: true, autoSkip: 'none', actions: ['skip'], autoRetryDelaysMs: [], cooldown: null, offerReplacement: false }],
    ['membership-required', { messageKey: 'status.songMembershipRequired', stopPlayback: true, autoSkip: 'none', actions: ['skip'], autoRetryDelaysMs: [], cooldown: null, offerReplacement: false }],
    ['purchase-required', { messageKey: 'status.songPurchaseRequired', stopPlayback: true, autoSkip: 'none', actions: ['skip'], autoRetryDelaysMs: [], cooldown: null, offerReplacement: false }],
    ['entitlement-required', { messageKey: 'status.songEntitlementRequired', stopPlayback: true, autoSkip: 'none', actions: ['skip'], autoRetryDelaysMs: [], cooldown: null, offerReplacement: false }],
    ['preview-only', { messageKey: 'status.songPreviewOnly', stopPlayback: true, autoSkip: 'none', actions: ['skip'], autoRetryDelaysMs: [], cooldown: null, offerReplacement: false }],
    ['region-restricted', { messageKey: 'status.songRegionRestricted', stopPlayback: true, autoSkip: 'none', actions: ['skip'], autoRetryDelaysMs: [], cooldown: null, offerReplacement: false }],
    ['taken-down', { messageKey: 'status.songUnavailable', stopPlayback: false, autoSkip: 'countdown', actions: [], autoRetryDelaysMs: [], cooldown: null, offerReplacement: true }],
    ['network', { messageKey: 'status.songNetworkFailed', stopPlayback: true, autoSkip: 'none', actions: ['retry', 'skip'], autoRetryDelaysMs: [1000, 3000], cooldown: null, offerReplacement: false }],
    ['timeout', { messageKey: 'status.songRequestTimedOut', stopPlayback: true, autoSkip: 'none', actions: ['retry', 'skip'], autoRetryDelaysMs: [2000], cooldown: null, offerReplacement: false }],
    ['service-unavailable', { messageKey: 'status.songServiceUnavailable', stopPlayback: true, autoSkip: 'none', actions: ['retry', 'skip'], autoRetryDelaysMs: [], cooldown: 'retry-after', offerReplacement: false }],
    ['rate-limited', { messageKey: 'status.songRateLimitedNoWait', stopPlayback: true, autoSkip: 'none', actions: ['retry', 'skip'], autoRetryDelaysMs: [], cooldown: 'retry-after', offerReplacement: false }],
    ['invalid-response', { messageKey: 'status.songTemporarilyUnavailable', stopPlayback: true, autoSkip: 'none', actions: ['retry', 'skip'], autoRetryDelaysMs: [], cooldown: null, offerReplacement: false }],
    ['unknown', { messageKey: 'status.songTemporarilyUnavailable', stopPlayback: true, autoSkip: 'none', actions: ['retry', 'skip'], autoRetryDelaysMs: [], cooldown: null, offerReplacement: false }],
];

const ALL_REASONS = TABLE.map(([reason]) => reason);

describe('playback failure policy table', () => {
    it('covers every reason exactly once', () => {
        expect(Object.keys(PLAYBACK_FAILURE_POLICY).sort()).toEqual([...ALL_REASONS].sort());
    });

    it.each(TABLE)('%s', (reason, expected) => {
        expect(resolvePlaybackFailurePolicy(failure(reason), 'play')).toMatchObject(expected);
    });

    it('lets only taken-down count down to a skip and offer a replacement', () => {
        for (const reason of ALL_REASONS) {
            const policy = resolvePlaybackFailurePolicy(failure(reason), 'play');
            const isTakenDown = reason === 'taken-down';
            expect(policy.autoSkip === 'countdown', reason).toBe(isTakenDown);
            expect(policy.offerReplacement, reason).toBe(isTakenDown);
            expect(Boolean(policy.countdownKey), reason).toBe(isTakenDown);
        }
        expect(PLAYBACK_FAILURE_POLICY['taken-down'].countdownKey).toBe('status.songUnavailablePrompt');
    });

    it('never says "unavailable" for anything but taken-down', () => {
        for (const reason of ALL_REASONS.filter(candidate => candidate !== 'taken-down')) {
            const variants = [
                failure(reason),
                failure(reason, { retryAfterMs: 5_000 }),
                failure(reason, { transient: false }),
                failure(reason, { hint: 'sign-in-may-help' }),
            ];
            for (const variant of variants) {
                for (const context of ['play', 'restore', 'mid-playback'] as const) {
                    const policy = resolvePlaybackFailurePolicy(variant, context);
                    expect(['status.songUnavailable', 'status.songUnavailablePrompt']).not.toContain(policy.messageKey);
                    expect(policy.countdownKey).toBeUndefined();
                }
            }
        }
    });

    it('retries quietly only for network and timeout', () => {
        for (const reason of ALL_REASONS) {
            const delays = resolvePlaybackFailurePolicy(failure(reason), 'play').autoRetryDelaysMs;
            if (reason === 'network') expect(delays).toEqual([1000, 3000]);
            else if (reason === 'timeout') expect(delays).toEqual([2000]);
            else expect(delays, reason).toEqual([]);
        }
    });
});

describe('policy variants', () => {
    it.each([
        [25_000, 25],
        [1_200, 2],
        [1, 1],
    ])('rate-limited with retryAfterMs %s asks to wait %s seconds', (retryAfterMs, seconds) => {
        const policy = resolvePlaybackFailurePolicy(failure('rate-limited', { retryAfterMs }), 'play');
        expect(policy).toMatchObject({ messageKey: 'status.songRateLimited', messageParams: { seconds } });
        expect(getPlaybackFailureMessage(failure('rate-limited', { retryAfterMs }))).toEqual({ key: 'status.songRateLimited', params: { seconds } });
    });

    it('rate-limited without a wait has no seconds', () => {
        const policy = resolvePlaybackFailurePolicy(failure('rate-limited'), 'play');
        expect(policy.messageKey).toBe('status.songRateLimitedNoWait');
        expect(policy.messageParams).toBeUndefined();
    });

    it('a service that is not configured offers no retry', () => {
        const policy = resolvePlaybackFailurePolicy(failure('service-unavailable', { transient: false }), 'play');
        expect(policy).toMatchObject({ messageKey: 'status.songServiceNotConfigured', actions: ['skip'] });
    });

    it('a service that may come back keeps retry', () => {
        const policy = resolvePlaybackFailurePolicy(failure('service-unavailable', { transient: true }), 'play');
        expect(policy).toMatchObject({ messageKey: 'status.songServiceUnavailable', actions: ['retry', 'skip'] });
    });

    it('unknown with a sign-in hint says signing in may help', () => {
        expect(resolvePlaybackFailurePolicy(failure('unknown', { hint: 'sign-in-may-help' }), 'play').messageKey)
            .toBe('status.songTemporarilyUnavailableSignInHint');
    });

    it('restore shows one message: no actions, no countdown', () => {
        for (const reason of ALL_REASONS) {
            const policy = resolvePlaybackFailurePolicy(failure(reason), 'restore');
            expect(policy.actions, reason).toEqual([]);
            expect(policy.autoSkip, reason).toBe('none');
            expect(policy.countdownKey, reason).toBeUndefined();
        }
    });

    it('mid-playback matches play', () => {
        for (const reason of ALL_REASONS) {
            expect(resolvePlaybackFailurePolicy(failure(reason), 'mid-playback')).toEqual(resolvePlaybackFailurePolicy(failure(reason), 'play'));
        }
    });

    it('does not mutate the shared table', () => {
        resolvePlaybackFailurePolicy(failure('taken-down'), 'restore');
        resolvePlaybackFailurePolicy(failure('service-unavailable', { transient: false }), 'play');
        expect(PLAYBACK_FAILURE_POLICY['taken-down'].countdownKey).toBe('status.songUnavailablePrompt');
        expect(PLAYBACK_FAILURE_POLICY['service-unavailable'].actions).toEqual(['retry', 'skip']);
    });
});

describe('skip unplayable songs setting', () => {
    const ON = { autoSkipUnplayable: true } as const;
    type SkipRow = [PlaybackFailureReason, Pick<PlaybackFailurePolicy, 'autoSkip' | 'stopPlayback' | 'actions'> & { countdownKey?: string }];

    // 打开后：受限类与原因不明的失败加上倒计时（文案不说原因），stopPlayback 与 actions 保持原样，次数用尽时退回它们；
    // 登录类、下架、网络类与关闭时完全相同。
    const ON_TABLE: SkipRow[] = [
        ['not-signed-in', { autoSkip: 'none', stopPlayback: true, actions: ['skip'], countdownKey: undefined }],
        ['session-expired', { autoSkip: 'none', stopPlayback: true, actions: ['skip'], countdownKey: undefined }],
        ['membership-required', { autoSkip: 'countdown', stopPlayback: true, actions: ['skip'], countdownKey: UNPLAYABLE_SKIP_PROMPT_KEY }],
        ['purchase-required', { autoSkip: 'countdown', stopPlayback: true, actions: ['skip'], countdownKey: UNPLAYABLE_SKIP_PROMPT_KEY }],
        ['entitlement-required', { autoSkip: 'countdown', stopPlayback: true, actions: ['skip'], countdownKey: UNPLAYABLE_SKIP_PROMPT_KEY }],
        ['preview-only', { autoSkip: 'countdown', stopPlayback: true, actions: ['skip'], countdownKey: UNPLAYABLE_SKIP_PROMPT_KEY }],
        ['region-restricted', { autoSkip: 'countdown', stopPlayback: true, actions: ['skip'], countdownKey: UNPLAYABLE_SKIP_PROMPT_KEY }],
        ['taken-down', { autoSkip: 'countdown', stopPlayback: false, actions: [], countdownKey: 'status.songUnavailablePrompt' }],
        ['network', { autoSkip: 'none', stopPlayback: true, actions: ['retry', 'skip'], countdownKey: undefined }],
        ['timeout', { autoSkip: 'none', stopPlayback: true, actions: ['retry', 'skip'], countdownKey: undefined }],
        ['service-unavailable', { autoSkip: 'none', stopPlayback: true, actions: ['retry', 'skip'], countdownKey: undefined }],
        ['rate-limited', { autoSkip: 'none', stopPlayback: true, actions: ['retry', 'skip'], countdownKey: undefined }],
        ['invalid-response', { autoSkip: 'countdown', stopPlayback: true, actions: ['retry', 'skip'], countdownKey: UNPLAYABLE_SKIP_PROMPT_KEY }],
        ['unknown', { autoSkip: 'countdown', stopPlayback: true, actions: ['retry', 'skip'], countdownKey: UNPLAYABLE_SKIP_PROMPT_KEY }],
    ];

    it('covers every reason', () => {
        expect(ON_TABLE.map(([reason]) => reason).sort()).toEqual([...ALL_REASONS].sort());
    });

    it.each(ON_TABLE)('on: %s', (reason, expected) => {
        const policy = resolvePlaybackFailurePolicy(failure(reason), 'play', ON);
        expect(policy).toMatchObject({ autoSkip: expected.autoSkip, stopPlayback: expected.stopPlayback, actions: expected.actions });
        expect(policy.countdownKey).toBe(expected.countdownKey);
        // 文案、重试、冷却、替代版本都不受设置影响。
        const off = resolvePlaybackFailurePolicy(failure(reason), 'play');
        expect(policy.messageKey).toBe(off.messageKey);
        expect(policy.autoRetryDelaysMs).toEqual(off.autoRetryDelaysMs);
        expect(policy.cooldown).toBe(off.cooldown);
        expect(policy.offerReplacement).toBe(off.offerReplacement);
    });

    it('off (explicitly or by default) is the plain table', () => {
        for (const reason of ALL_REASONS) {
            const plain = resolvePlaybackFailurePolicy(failure(reason), 'play');
            expect(resolvePlaybackFailurePolicy(failure(reason), 'play', { autoSkipUnplayable: false }), reason).toEqual(plain);
            expect(resolvePlaybackFailurePolicy(failure(reason), 'play', {}), reason).toEqual(plain);
        }
    });

    it('treats unknown with a sign-in hint like a sign-in failure: no skip', () => {
        const policy = resolvePlaybackFailurePolicy(failure('unknown', { hint: 'sign-in-may-help' }), 'play', ON);
        expect(policy.autoSkip).toBe('none');
        expect(policy.countdownKey).toBeUndefined();
        expect(policy.messageKey).toBe('status.songTemporarilyUnavailableSignInHint');
    });

    it.each(['maybe-membership', 'maybe-region-restricted'] as const)('still skips unknown with the %s hint', hint => {
        expect(resolvePlaybackFailurePolicy(failure('unknown', { hint }), 'play', ON)).toMatchObject({
            autoSkip: 'countdown', countdownKey: UNPLAYABLE_SKIP_PROMPT_KEY,
        });
    });

    it('never skips in the restore context', () => {
        for (const reason of ALL_REASONS) {
            const policy = resolvePlaybackFailurePolicy(failure(reason), 'restore', ON);
            expect(policy.autoSkip, reason).toBe('none');
            expect(policy.actions, reason).toEqual([]);
            expect(policy.countdownKey, reason).toBeUndefined();
        }
    });

    it('mid-playback matches play', () => {
        for (const reason of ALL_REASONS) {
            expect(resolvePlaybackFailurePolicy(failure(reason), 'mid-playback', ON))
                .toEqual(resolvePlaybackFailurePolicy(failure(reason), 'play', ON));
        }
    });

    it('does not mutate the shared table', () => {
        resolvePlaybackFailurePolicy(failure('membership-required'), 'play', ON);
        resolvePlaybackFailurePolicy(failure('unknown'), 'play', ON);
        expect(PLAYBACK_FAILURE_POLICY['membership-required'].autoSkip).toBe('none');
        expect(PLAYBACK_FAILURE_POLICY['membership-required'].countdownKey).toBeUndefined();
        expect(PLAYBACK_FAILURE_POLICY.unknown.autoSkip).toBe('none');
    });

    it('isAutoSkipFailure answers exactly whether the resolved policy counts down', () => {
        for (const options of [{}, ON]) {
            for (const context of ['play', 'restore', 'mid-playback'] as const) {
                for (const reason of ALL_REASONS) {
                    const expected = resolvePlaybackFailurePolicy(failure(reason), context, options).autoSkip === 'countdown';
                    expect(isAutoSkipFailure(failure(reason), context, options), `${reason} ${context} ${JSON.stringify(options)}`).toBe(expected);
                }
            }
        }
        expect(isAutoSkipFailure(failure('taken-down'), 'play')).toBe(true);
        expect(isAutoSkipFailure(failure('membership-required'), 'play')).toBe(false);
        expect(isAutoSkipFailure(failure('membership-required'), 'play', ON)).toBe(true);
        expect(isAutoSkipFailure(failure('network'), 'play', ON)).toBe(false);
    });

    it('registers the countdown key for the locale coverage check', () => {
        expect(UNPLAYABLE_SKIP_PROMPT_KEY).toBe('status.songUnplayableSkipPrompt');
        expect(PLAYBACK_FAILURE_MESSAGE_KEYS).toContain(UNPLAYABLE_SKIP_PROMPT_KEY);
    });
});

describe('buildPlaybackFailureStatus', () => {
    it('retry and skip become the primary and secondary buttons', () => {
        const handlers = { retry: vi.fn(), skip: vi.fn(), dismiss: vi.fn() };
        const status = buildPlaybackFailureStatus(resolvePlaybackFailurePolicy(failure('network'), 'play'), t, handlers);
        expect(status).toEqual({
            type: 'error',
            text: 'status.songNetworkFailed',
            persistent: true,
            actionLabel: 'ui.retry',
            onAction: handlers.retry,
            cancelLabel: 'status.skipUnavailableAction',
            onCancel: handlers.skip,
        });
    });

    it('a lone skip gets cancel as the secondary button', () => {
        const handlers = { retry: vi.fn(), skip: vi.fn(), dismiss: vi.fn() };
        const status = buildPlaybackFailureStatus(resolvePlaybackFailurePolicy(failure('session-expired'), 'play'), t, handlers);
        expect(status).toMatchObject({
            persistent: true,
            text: 'status.loginExpired',
            actionLabel: 'status.skipUnavailableAction',
            onAction: handlers.skip,
            cancelLabel: 'status.cancel',
            onCancel: handlers.dismiss,
        });
    });

    it('drops an action that has no handler (no next song to skip to)', () => {
        const handlers = { retry: vi.fn(), dismiss: vi.fn() };
        const status = buildPlaybackFailureStatus(resolvePlaybackFailurePolicy(failure('unknown'), 'play'), t, handlers);
        expect(status).toMatchObject({
            persistent: true,
            actionLabel: 'ui.retry',
            onAction: handlers.retry,
            cancelLabel: 'status.cancel',
            onCancel: handlers.dismiss,
        });
    });

    it('is a plain, non-persistent error when no action is left', () => {
        const handlers = { dismiss: vi.fn() };
        expect(buildPlaybackFailureStatus(resolvePlaybackFailurePolicy(failure('session-expired'), 'play'), t, handlers))
            .toEqual({ type: 'error', text: 'status.loginExpired' });
        expect(buildPlaybackFailureStatus(resolvePlaybackFailurePolicy(failure('network'), 'restore'), t, { retry: vi.fn(), skip: vi.fn(), dismiss: vi.fn() }))
            .toEqual({ type: 'error', text: 'status.songNetworkFailed' });
    });

    it('passes the message params to t', () => {
        const status = buildPlaybackFailureStatus(
            resolvePlaybackFailurePolicy(failure('rate-limited', { retryAfterMs: 9_500 }), 'play'),
            t,
            { dismiss: vi.fn() },
        );
        expect(status.text).toBe('status.songRateLimited:{"seconds":10}');
    });

    it('marks only its persistent messages as playback failure toasts', () => {
        const withButtons = buildPlaybackFailureStatus(resolvePlaybackFailurePolicy(failure('network'), 'play'), t, { retry: vi.fn(), skip: vi.fn(), dismiss: vi.fn() });
        const skipOnly = buildPlaybackFailureStatus(resolvePlaybackFailurePolicy(failure('session-expired'), 'play'), t, { skip: vi.fn(), dismiss: vi.fn() });
        const plain = buildPlaybackFailureStatus(resolvePlaybackFailurePolicy(failure('network'), 'restore'), t, { dismiss: vi.fn() });
        expect(isPlaybackFailureStatus(withButtons)).toBe(true);
        expect(isPlaybackFailureStatus(skipOnly)).toBe(true);
        expect(isPlaybackFailureStatus(plain)).toBe(false);
        expect(isPlaybackFailureStatus({ ...withButtons })).toBe(false);
        expect(isPlaybackFailureStatus(null)).toBe(false);
    });
});

describe('message key registry', () => {
    it('lists every message key, variant, countdown key and the retrying key', () => {
        const keys = new Set(PLAYBACK_FAILURE_MESSAGE_KEYS);
        const variants: PlaybackFailure[] = ALL_REASONS.flatMap(reason => [
            failure(reason),
            failure(reason, { retryAfterMs: 5_000 }),
            failure(reason, { transient: false }),
            failure(reason, { hint: 'sign-in-may-help' }),
        ]);
        for (const variant of variants) {
            const policy = resolvePlaybackFailurePolicy(variant, 'play');
            expect(keys.has(policy.messageKey), policy.messageKey).toBe(true);
            if (policy.countdownKey) expect(keys.has(policy.countdownKey), policy.countdownKey).toBe(true);
        }
        expect(keys.has('status.songUnavailablePrompt')).toBe(true);
        expect(keys.has(PLAYBACK_RETRYING_MESSAGE_KEY)).toBe(true);
        expect(PLAYBACK_RETRYING_MESSAGE_KEY).toBe('status.songRetrying');
        expect(PLAYBACK_FAILURE_MESSAGE_KEYS.length).toBe(keys.size);
    });

    it('exposes the button label keys', () => {
        expect(PLAYBACK_FAILURE_ACTION_LABEL_KEYS).toEqual(['ui.retry', 'status.skipUnavailableAction', 'status.cancel']);
    });
});

describe('sleepForPlaybackRetry', () => {
    it('waits on globalThis.setTimeout', async () => {
        vi.useFakeTimers();
        try {
            let done = false;
            const pending = sleepForPlaybackRetry(1000).then(() => { done = true; });
            await vi.advanceTimersByTimeAsync(999);
            expect(done).toBe(false);
            await vi.advanceTimersByTimeAsync(1);
            await pending;
            expect(done).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });
});

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, AlertCircle, UserRound, LogOut, RefreshCw, LogIn, ChevronRight, KeyRound } from 'lucide-react';
import { omni } from '../../../services/onlineMusic/omni';
import { useOnlineProviderAccountStore, type OnlineProviderAccountState } from '../../../stores/useOnlineProviderAccountStore';
import { clearProviderAccountSnapshot, loadProviderAccountSnapshot, saveProviderAccountSnapshot } from '../../../services/onlineMusic/providerAccountCache';
import { useSettingsModalStore } from '../../../stores/useSettingsModalStore';
import { registerModalBack, runTopModalBack } from '../../../services/modalBackStack';
import type { OnlineProviderId, QrLoginMethod } from '../../../types/onlineMusic';
import MobileSheet from '../../shared/MobileSheet';
import { useLiquidReduced } from '../../shared/useLiquidReduced';
import { TY_DURATION, TY_EASE } from '../../shared/motionTokens';
import { useSheetThemeTokens } from '../../../library/suites/mobile/native/sheetThemeTokens';
import qqIcon from '../../../assets/providers/qq.svg';
import wechatIcon from '../../../assets/providers/wechat.svg';

// src/components/modal/settings/PlatformAccountsPage.tsx
const BRAND_STYLES: Record<string, { bg: string; fg: string; abbr: string }> = {
    netease: { bg: '#E60026', fg: '#FFFFFF', abbr: '云' },
    qq: { bg: '#12B76A', fg: '#FFFFFF', abbr: 'QQ' },
    kugou: { bg: '#0C84FF', fg: '#FFFFFF', abbr: '酷' },
    bodian: { bg: '#5B6CFF', fg: '#FFFFFF', abbr: '波' },
    qishui: { bg: '#00C2B3', fg: '#FFFFFF', abbr: '汽' },
};

export type AccountDisplayPhase = 'resolving' | 'authenticated' | 'network-error' | 'auth-required' | 'anonymous';

export function resolveAccountDisplayState(account: OnlineProviderAccountState | undefined): {
    phase: AccountDisplayPhase;
    statusText: string;
    buttonLabel: string;
    isLoggedIn: boolean;
} {
    if (!account || account.hydration === 'loading' || account.status === 'unknown') {
        return {
            phase: 'resolving',
            statusText: '正在恢复登录状态…',
            buttonLabel: '恢复中',
            isLoggedIn: false,
        };
    }
    if (account.status === 'authenticated' && account.user) {
        const displayName = account.user.nickname || String(account.user.id ?? '') || '已登录';
        if (account.freshness === 'error') {
            return {
                phase: 'network-error',
                statusText: `${displayName} · 网络异常，暂时无法验证`,
                buttonLabel: '管理',
                isLoggedIn: true,
            };
        }
        return {
            phase: 'authenticated',
            statusText: displayName,
            buttonLabel: '管理',
            isLoggedIn: true,
        };
    }
    if (account.error === 'auth-required') {
        return {
            phase: 'auth-required',
            statusText: '授权已失效，请重新扫码',
            buttonLabel: '重新授权',
            isLoggedIn: false,
        };
    }
    if (account.status === 'error' || account.freshness === 'error') {
        return {
            phase: 'network-error',
            statusText: '网络异常，暂时无法验证登录状态',
            buttonLabel: '重试校验',
            isLoggedIn: false,
        };
    }
    return {
        phase: 'anonymous',
        statusText: '未登录（可使用公开推荐与搜索）',
        buttonLabel: '登录',
        isLoggedIn: false,
    };
}

export function qrMethodLabel(method?: QrLoginMethod): string {
    if (!method) return '';
    if (method.id === 'qq') return 'QQ登录';
    if (method.id === 'wechat') return '微信登录';
    return method.labelKey || method.id;
}

export function qrMethodPrompt(providerId: OnlineProviderId, method?: QrLoginMethod): string {
    if (method?.id === 'wechat') return '请使用微信扫码授权';
    if (method?.id === 'qq') return '请使用手机QQ扫码授权';
    if (providerId === 'netease') return '请使用网易云音乐 App 扫码授权';
    if (providerId === 'kugou') return '请使用酷狗音乐 App 扫码授权';
    if (providerId === 'bodian') return '请使用波点音乐 App 扫码授权';
    if (providerId === 'qishui') return '请使用抖音 / 汽水音乐 App 扫码授权';
    return '请使用对应平台 App 扫码授权';
}

export function selectQrLoginStep(methods: readonly QrLoginMethod[]):
    | { kind: 'pick'; methods: readonly QrLoginMethod[] }
    | { kind: 'direct'; method?: QrLoginMethod } {
    if (methods.length > 1) return { kind: 'pick', methods };
    return { kind: 'direct', method: methods[0] };
}

export default function PlatformAccountsPage({ onClose }: { onClose: () => void }) {
    const tokens = useSheetThemeTokens();
    const reduced = useLiquidReduced();
    const accounts = useOnlineProviderAccountStore(s => s.accounts);
    useSyncExternalStore(omni.subscribeProviders, omni.getProviderRegistryVersion);
    const providers = omni.getProviderSummaries();
    const fromIndex = useSettingsModalStore(s => s.settingsModalState.returnToIndex);
    const [closing, setClosing] = useState(false);
    const closingRef = useRef(false);
    const closedRef = useRef(false);
    const commitBack = useCallback(() => {
        if (closedRef.current) return;
        closedRef.current = true;
        if (fromIndex) useSettingsModalStore.getState().returnSettingsToIndex();
        else onClose();
    }, [fromIndex, onClose]);
    const back = useCallback(() => {
        if (closingRef.current || closedRef.current) return;
        closingRef.current = true;
        if (reduced) {
            commitBack();
            return;
        }
        setClosing(true);
    }, [reduced, commitBack]);
    const finishClose = useCallback(() => {
        if (closing) commitBack();
    }, [closing, commitBack]);

    useEffect(() => {
        if (!closing) return;
        const timer = setTimeout(commitBack, Math.round(TY_DURATION.panelExit * 1000) + 80);
        return () => clearTimeout(timer);
    }, [closing, commitBack]);

    const [managingId, setManagingId] = useState<OnlineProviderId | null>(null);
    const [confirmLogoutId, setConfirmLogoutId] = useState<OnlineProviderId | null>(null);
    const [methodPicker, setMethodPicker] = useState<{ providerId: OnlineProviderId; methods: readonly QrLoginMethod[] } | null>(null);
    const [qrLogin, setQrLogin] = useState<{
        providerId: OnlineProviderId;
        key: string;
        imageUrl: string;
        method?: QrLoginMethod;
        canReturnToMethods: boolean;
        methods: readonly QrLoginMethod[];
        statusText: string;
        expired?: boolean;
    } | null>(null);
    const activeQrRef = useRef<{ token: number; providerId: OnlineProviderId; key: string } | null>(null);
    const qrTokenRef = useRef(0);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [notice, setNotice] = useState('');

    const stopActiveQr = useCallback(() => {
        qrTokenRef.current += 1;
        const active = activeQrRef.current;
        activeQrRef.current = null;
        if (active) {
            void omni.cancelQrLogin(active.providerId, active.key).catch(() => {});
        }
    }, []);

    useEffect(() => () => { stopActiveQr(); }, [stopActiveQr]);

    useEffect(() => {
        const unregister = registerModalBack(() => {
            back();
        });
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !event.defaultPrevented) {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (!runTopModalBack()) back();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => {
            unregister();
            window.removeEventListener('keydown', onKey, true);
        };
    }, [back]);

    const refreshProviderAccount = async (providerId: OnlineProviderId) => {
        setNotice('');
        setBusyId(providerId);
        try {
            const user = await omni.getLoginStatus(providerId);
            if (!user) {
                setNotice(`${omni.getProviderLabel(providerId, false)}登录状态已失效，请重新授权`);
                return false;
            }
            const capabilities = omni.getProviderCapabilities(providerId);
            const collections = capabilities.userLibrary
                ? (await omni.getProviderUserPlaylists(providerId, user.id, { offset: 0, limit: 50 }).catch(() => ({ items: [] }))).items
                : [];
            const likedSongIds = capabilities.likes
                ? await omni.getProviderLikedSongIds(providerId, user.id).catch(() => [])
                : [];
            useOnlineProviderAccountStore.getState().updateAccount(providerId, {
                status: 'authenticated',
                user,
                collections,
                likedSongIds,
                error: undefined,
                hydration: 'ready',
                freshness: 'fresh',
                lastUpdatedAt: Date.now(),
            });
            await saveProviderAccountSnapshot(providerId, { user, collections, likedSongIds }).catch(() => {});
            setNotice(`${omni.getProviderLabel(providerId, false)}登录状态已刷新`);
            return true;
        } catch {
            setNotice(`${omni.getProviderLabel(providerId, false)}网络异常，暂时无法刷新`);
            return false;
        } finally {
            setBusyId(null);
        }
    };

    const beginQrSession = async (
        providerId: OnlineProviderId,
        method: QrLoginMethod | undefined,
        methods: readonly QrLoginMethod[],
        canReturnToMethods: boolean,
    ) => {
        stopActiveQr();
        const sessionToken = ++qrTokenRef.current;
        setNotice('');
        setBusyId(providerId);
        try {
            const qr = await omni.createQrLogin(providerId, method?.id);
            if (qrTokenRef.current !== sessionToken) {
                if (qr?.key) void omni.cancelQrLogin(providerId, qr.key).catch(() => {});
                return;
            }
            if (!qr?.key || !qr?.imageUrl) {
                const recovered = await refreshProviderAccount(providerId);
                if (!recovered) {
                    setNotice(`${omni.getProviderLabel(providerId, false)}暂未返回二维码，请重试`);
                }
                return;
            }
            activeQrRef.current = { token: sessionToken, providerId, key: qr.key };
            setMethodPicker(null);
            setQrLogin({
                providerId,
                key: qr.key,
                imageUrl: qr.imageUrl,
                method,
                canReturnToMethods,
                methods,
                statusText: '等待扫码',
                expired: false,
            });
            const poll = async () => {
                for (let attempt = 0; attempt < 45; attempt++) {
                    await new Promise(r => setTimeout(r, 2000));
                    if (qrTokenRef.current !== sessionToken) return;
                    try {
                        const res = await omni.checkQrLogin(providerId, qr.key);
                        if (qrTokenRef.current !== sessionToken) return;
                        if (res.state === 'confirmed') {
                            const user = await omni.getLoginStatus(providerId).catch(() => null);
                            if (qrTokenRef.current !== sessionToken) return;
                            if (!user) {
                                stopActiveQr();
                                setQrLogin(cur => cur ? { ...cur, statusText: '授权尚未生效，请重新扫码', expired: true } : null);
                                return;
                            }
                            useOnlineProviderAccountStore.getState().updateAccount(providerId, {
                                status: 'authenticated',
                                user,
                                error: undefined,
                                hydration: 'ready',
                                freshness: 'fresh',
                                lastUpdatedAt: Date.now(),
                            });
                            await saveProviderAccountSnapshot(providerId, {
                                user,
                                collections: [],
                                likedSongIds: [],
                            }).catch(() => {});
                            activeQrRef.current = null;
                            setQrLogin(null);
                            setNotice(`${omni.getProviderLabel(providerId, false)}登录成功`);
                            return;
                        }
                        if (res.state === 'expired') {
                            setQrLogin(cur => cur ? { ...cur, statusText: '二维码已过期，请点击刷新', expired: true } : null);
                            return;
                        }
                        if (res.state === 'error') {
                            setQrLogin(cur => cur ? { ...cur, statusText: '授权失败，请刷新重试', expired: true } : null);
                            return;
                        }
                        if (res.state === 'scanned') {
                            setQrLogin(cur => cur ? { ...cur, statusText: '已扫码，请在手机上确认登录' } : null);
                        }
                    } catch { /* Continue polling on transient errors. */ }
                }
            };
            void poll();
        } catch {
            setNotice(`${omni.getProviderLabel(providerId, false)}二维码获取失败，请重试`);
        } finally {
            setBusyId(null);
        }
    };

    const startProviderLogin = async (providerId: OnlineProviderId, options?: { forceLogin?: boolean }) => {
        setNotice('');
        setBusyId(providerId);
        try {
            if (!options?.forceLogin) {
                const currentAccount = useOnlineProviderAccountStore.getState().accounts[providerId];
                const currentPhase = resolveAccountDisplayState(currentAccount).phase;
                if (currentPhase === 'resolving' || currentPhase === 'network-error') {
                    const recovered = await omni.getLoginStatus(providerId).catch(() => null);
                    if (recovered) {
                        const snapshot = await loadProviderAccountSnapshot(providerId).catch(() => null);
                        const matching = snapshot && String(snapshot.user.id) === String(recovered.id) ? snapshot : null;
                        useOnlineProviderAccountStore.getState().updateAccount(providerId, {
                            status: 'authenticated',
                            user: recovered,
                            collections: matching?.collections || [],
                            likedSongIds: matching?.likedSongIds || [],
                            error: undefined,
                            hydration: 'ready',
                            freshness: 'fresh',
                            lastUpdatedAt: Date.now(),
                        });
                        await saveProviderAccountSnapshot(providerId, {
                            user: recovered,
                            collections: matching?.collections || [],
                            likedSongIds: matching?.likedSongIds || [],
                        }).catch(() => {});
                        setNotice(`${omni.getProviderLabel(providerId, false)}登录状态已恢复`);
                        return;
                    }
                }
            }
            const methods = await omni.resolveQrLoginMethods(providerId);
            const step = selectQrLoginStep(methods);
            if (step.kind === 'pick') {
                setMethodPicker({ providerId, methods: step.methods });
                return;
            }
            await beginQrSession(providerId, step.method, methods, false);
        } catch {
            setNotice(`${omni.getProviderLabel(providerId, false)}登录未完成，请重试`);
        } finally {
            setBusyId(null);
        }
    };

    const performLogout = async (providerId: OnlineProviderId) => {
        setBusyId(providerId);
        setNotice('');
        try {
            await Promise.allSettled([omni.logout(providerId), clearProviderAccountSnapshot(providerId)]);
            useOnlineProviderAccountStore.getState().clearAccount(providerId);
            setNotice(`已退出 ${omni.getProviderLabel(providerId, false)}`);
        } catch {
            useOnlineProviderAccountStore.getState().clearAccount(providerId);
        } finally {
            setBusyId(null);
            setConfirmLogoutId(null);
            setManagingId(null);
        }
    };

    const managingAccount = managingId ? accounts[managingId] : undefined;

    return createPortal(
        <motion.div
            initial={reduced ? false : { x: '100%', opacity: 0.92 }}
            animate={closing ? { x: '100%', opacity: 0 } : { x: 0, opacity: 1 }}
            transition={reduced ? { duration: 0 } : closing
                ? { duration: TY_DURATION.panelExit, ease: TY_EASE.exit }
                : { duration: TY_DURATION.slow, ease: TY_EASE.emphasized }}
            onAnimationComplete={finishClose}
            className="fixed inset-0 overflow-y-auto"
            style={{
                zIndex: 136,
                background: tokens.pageBg,
                color: tokens.text,
                paddingTop: 'var(--folia-main-inset-top, env(safe-area-inset-top, 0px))',
                paddingBottom: 'max(32px, var(--folia-main-inset-bottom, env(safe-area-inset-bottom, 0px)))',
            }}
            data-folia-settings-overlay="true"
            data-folia-keyboard-window="true"
        >
            <div
                style={{
                    paddingLeft: 'max(20px, var(--folia-main-inset-left, env(safe-area-inset-left, 0px)))',
                    paddingRight: 'max(20px, var(--folia-main-inset-right, env(safe-area-inset-right, 0px)))',
                }}
            >
                {/* 二级顶部栏：高度 56dp，标题 22sp */}
                <div className="flex items-center" style={{ height: 56 }}>
                    <button
                        type="button"
                        aria-label="返回"
                        onClick={back}
                        className="flex items-center justify-center rounded-full"
                        style={{ width: 48, height: 48, marginLeft: -12 }}
                    >
                        <ArrowLeft size={22} />
                    </button>
                    <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 0 4px' }}>音乐平台账号</h1>
                </div>

                <p style={{ fontSize: 12, color: tokens.muted, margin: '4px 0 16px', lineHeight: 1.5 }}>
                    统一管理各音乐平台的登录状态，同步个人歌单、收藏及高音质播放权限。不会影响自定义音源导入。
                </p>

                {notice && (
                    <div
                        className="rounded-xl px-3.5 py-2.5 mb-3"
                        style={{ fontSize: 13, background: tokens.accentSoft, color: tokens.accent }}
                    >
                        {notice}
                    </div>
                )}

                {/* 分组卡片圆角 16dp */}
                <div
                    className="flex flex-col overflow-hidden"
                    style={{
                        borderRadius: 16,
                        background: tokens.cardBg,
                        border: `1px solid ${tokens.border}`,
                    }}
                >
                    {providers.map((provider, idx) => {
                        const account = accounts[provider.providerId];
                        const display = resolveAccountDisplayState(account);
                        const loggedIn = display.isLoggedIn;
                        const expired = display.phase === 'auth-required' || display.phase === 'network-error';
                        const brand = BRAND_STYLES[provider.providerId] ?? { bg: tokens.accent, fg: '#FFFFFF', abbr: provider.displayName.slice(0, 1) };
                        const label = omni.getProviderLabel(provider.providerId, false);
                        const statusText = display.statusText;

                        return (
                            <div
                                key={provider.providerId}
                                className="flex items-center justify-between px-4"
                                style={{
                                    minHeight: 72,
                                    borderTop: idx > 0 ? `1px solid ${tokens.border}` : 'none',
                                }}
                            >
                                <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                                    {loggedIn && account?.user?.avatarUrl ? (
                                        <img
                                            src={account.user.avatarUrl}
                                            alt=""
                                            className="rounded-xl object-cover shrink-0"
                                            style={{ width: 40, height: 40 }}
                                        />
                                    ) : (
                                        <div
                                            className="flex items-center justify-center rounded-xl shrink-0 font-bold"
                                            style={{ width: 40, height: 40, background: brand.bg, color: brand.fg, fontSize: 14 }}
                                        >
                                            {brand.abbr}
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className="truncate font-semibold" style={{ fontSize: 15 }}>{label}</span>
                                            {loggedIn && <CheckCircle2 size={14} color="#12B76A" className="shrink-0" />}
                                            {!loggedIn && expired && <AlertCircle size={14} color="#F59E0B" className="shrink-0" />}
                                        </div>
                                        <div className="truncate mt-0.5" style={{ fontSize: 12, color: tokens.muted }}>
                                            {statusText}
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    disabled={busyId === provider.providerId}
                                    onClick={() => loggedIn ? setManagingId(provider.providerId) : void startProviderLogin(provider.providerId)}
                                    className="flex items-center justify-center shrink-0 disabled:opacity-50"
                                    style={{ minHeight: 48, minWidth: 64 }}
                                >
                                    <span
                                        className="flex items-center justify-center px-3.5 rounded-full"
                                        style={{
                                            height: 32,
                                            fontSize: 13,
                                            fontWeight: 600,
                                            background: loggedIn ? tokens.secondaryBtnBg : tokens.primaryBtnBg,
                                            color: loggedIn ? tokens.secondaryBtnText : tokens.primaryBtnText,
                                        }}
                                    >
                                        {busyId === provider.providerId ? '处理中' : display.buttonLabel}
                                    </span>
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {managingId && (
                <MobileSheet
                    title={omni.getProviderLabel(managingId, false)}
                    onClose={() => { setManagingId(null); setConfirmLogoutId(null); }}
                >
                    <div className="flex flex-col gap-3">
                        {/* 账号信息卡片 */}
                        <div
                            className="flex items-center gap-3 rounded-2xl"
                            style={{ padding: '12px 16px', background: tokens.cardBg, border: `1px solid ${tokens.border}` }}
                        >
                            {managingAccount?.user?.avatarUrl ? (
                                <img
                                    src={managingAccount.user.avatarUrl}
                                    alt=""
                                    className="rounded-xl object-cover shrink-0"
                                    style={{ width: 40, height: 40 }}
                                />
                            ) : (
                                <div
                                    className="flex items-center justify-center rounded-xl shrink-0"
                                    style={{ width: 40, height: 40, background: tokens.accentSoft }}
                                >
                                    <UserRound size={20} color={tokens.accent} />
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    <span className="truncate font-semibold" style={{ fontSize: 15 }}>
                                        {managingAccount?.user?.nickname || String(managingAccount?.user?.id ?? '') || '已授权账号'}
                                    </span>
                                    <CheckCircle2 size={14} color="#12B76A" className="shrink-0" />
                                </div>
                                <div className="truncate mt-0.5" style={{ fontSize: 12, color: tokens.muted }}>
                                    {managingAccount?.lastUpdatedAt
                                        ? `最近同步：${new Date(managingAccount.lastUpdatedAt).toLocaleString()}`
                                        : '已登录'}
                                </div>
                            </div>
                        </div>

                        {/* 账号操作分组 */}
                        <div
                            className="flex flex-col overflow-hidden rounded-2xl"
                            style={{ background: tokens.cardBg, border: `1px solid ${tokens.border}` }}
                        >
                            <button
                                type="button"
                                onClick={() => { const id = managingId; setManagingId(null); void refreshProviderAccount(id); }}
                                className="flex items-center gap-3 w-full text-left"
                                style={{ minHeight: 60, padding: '10px 16px' }}
                            >
                                <span className="flex items-center justify-center shrink-0" style={{ width: 24, height: 24 }}>
                                    <RefreshCw size={20} color={tokens.accent} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="font-medium" style={{ fontSize: 15 }}>刷新登录状态</div>
                                    <div className="truncate" style={{ fontSize: 12, color: tokens.muted }}>同步账号信息、歌单及收藏</div>
                                </div>
                                <ChevronRight size={18} color={tokens.muted} className="shrink-0" />
                            </button>

                            <button
                                type="button"
                                onClick={() => { const id = managingId; setManagingId(null); void startProviderLogin(id, { forceLogin: true }); }}
                                className="flex items-center gap-3 w-full text-left"
                                style={{ minHeight: 60, padding: '10px 16px', borderTop: `1px solid ${tokens.border}` }}
                            >
                                <span className="flex items-center justify-center shrink-0" style={{ width: 24, height: 24 }}>
                                    <KeyRound size={20} color={tokens.accent} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="font-medium" style={{ fontSize: 15 }}>重新授权</div>
                                    <div className="truncate" style={{ fontSize: 12, color: tokens.muted }}>重新验证当前平台账号</div>
                                </div>
                                <ChevronRight size={18} color={tokens.muted} className="shrink-0" />
                            </button>

                            <button
                                type="button"
                                onClick={() => { const id = managingId; setManagingId(null); void startProviderLogin(id, { forceLogin: true }); }}
                                className="flex items-center gap-3 w-full text-left"
                                style={{ minHeight: 60, padding: '10px 16px', borderTop: `1px solid ${tokens.border}` }}
                            >
                                <span className="flex items-center justify-center shrink-0" style={{ width: 24, height: 24 }}>
                                    <LogIn size={20} color={tokens.accent} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="font-medium" style={{ fontSize: 15 }}>切换账号</div>
                                    <div className="truncate" style={{ fontSize: 12, color: tokens.muted }}>使用其他账号登录</div>
                                </div>
                                <ChevronRight size={18} color={tokens.muted} className="shrink-0" />
                            </button>
                        </div>

                        {/* 独立危险操作卡片 */}
                        {confirmLogoutId !== managingId ? (
                            <button
                                type="button"
                                onClick={() => setConfirmLogoutId(managingId)}
                                className="flex items-center gap-3 w-full text-left rounded-2xl text-red-500"
                                style={{
                                    minHeight: 60,
                                    padding: '10px 16px',
                                    background: tokens.cardBg,
                                    border: '1px solid rgba(239,68,68,0.28)',
                                }}
                            >
                                <span className="flex items-center justify-center shrink-0" style={{ width: 24, height: 24 }}>
                                    <LogOut size={20} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="font-medium" style={{ fontSize: 15 }}>退出登录</div>
                                    <div className="opacity-80" style={{ fontSize: 12 }}>仅退出当前平台账号</div>
                                </div>
                            </button>
                        ) : (
                            <div
                                className="flex items-center justify-between rounded-2xl border border-red-500/40"
                                style={{ minHeight: 60, padding: '10px 16px' }}
                            >
                                <span className="text-[13px] text-red-500">确认退出该平台账号？</span>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setConfirmLogoutId(null)} className="px-3 py-1.5 text-[12px] rounded-xl border border-current/15">取消</button>
                                    <button type="button" onClick={() => void performLogout(managingId)} className="px-3 py-1.5 text-[12px] rounded-xl bg-red-500 text-white">确认退出</button>
                                </div>
                            </div>
                        )}
                    </div>
                </MobileSheet>
            )}

            {methodPicker && (
                <MobileSheet
                    title={`登录 ${omni.getProviderLabel(methodPicker.providerId, false)}`}
                    subtitle="请选择登录方式"
                    onClose={() => setMethodPicker(null)}
                >
                    <div
                        className="flex flex-col overflow-hidden rounded-2xl"
                        style={{ background: tokens.cardBg, border: `1px solid ${tokens.border}` }}
                    >
                        {methodPicker.methods.map((method, index) => {
                            const iconSrc = method.id === 'wechat' ? wechatIcon : method.id === 'qq' ? qqIcon : undefined;
                            return (
                                <button
                                    key={method.id}
                                    type="button"
                                    onClick={() => void beginQrSession(methodPicker.providerId, method, methodPicker.methods, true)}
                                    className="flex items-center gap-3 w-full text-left"
                                    style={{
                                        minHeight: 60,
                                        padding: '10px 16px',
                                        borderTop: index > 0 ? `1px solid ${tokens.border}` : 'none',
                                    }}
                                >
                                    <span className="flex items-center justify-center shrink-0" style={{ width: 24, height: 24 }}>
                                        {iconSrc
                                            ? <img src={iconSrc} alt="" style={{ width: 22, height: 22 }} />
                                            : <LogIn size={20} color={tokens.accent} />}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium" style={{ fontSize: 15 }}>{qrMethodLabel(method)}</div>
                                        <div className="truncate" style={{ fontSize: 12, color: tokens.muted }}>
                                            {qrMethodPrompt(methodPicker.providerId, method)}
                                        </div>
                                    </div>
                                    <ChevronRight size={18} color={tokens.muted} className="shrink-0" />
                                </button>
                            );
                        })}
                    </div>
                </MobileSheet>
            )}

            {qrLogin && (
                <MobileSheet
                    title={qrLogin.method
                        ? `${omni.getProviderLabel(qrLogin.providerId, false)} · ${qrMethodLabel(qrLogin.method)}`
                        : `登录 ${omni.getProviderLabel(qrLogin.providerId, false)}`}
                    subtitle={qrMethodPrompt(qrLogin.providerId, qrLogin.method)}
                    onClose={() => {
                        const returnMethods = qrLogin.canReturnToMethods ? { providerId: qrLogin.providerId, methods: qrLogin.methods } : null;
                        stopActiveQr();
                        setQrLogin(null);
                        if (returnMethods) setMethodPicker(returnMethods);
                    }}
                >
                    <div className="flex flex-col items-center py-3 gap-3">
                        <img
                            src={qrLogin.imageUrl}
                            alt="登录二维码"
                            className="rounded-2xl bg-white p-2"
                            style={{ width: 200, height: 200, objectFit: 'contain' }}
                        />
                        <p className="text-[13px] m-0 font-medium" style={{ color: qrLogin.expired ? '#EF4444' : tokens.muted }}>
                            {qrLogin.statusText}
                        </p>
                        <div className="flex items-center gap-3">
                            {qrLogin.canReturnToMethods && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const returnMethods = { providerId: qrLogin.providerId, methods: qrLogin.methods };
                                        stopActiveQr();
                                        setQrLogin(null);
                                        setMethodPicker(returnMethods);
                                    }}
                                    className="px-4 py-2 rounded-full text-[13px] font-medium"
                                    style={{ background: tokens.secondaryBtnBg, color: tokens.secondaryBtnText }}
                                >
                                    更换登录方式
                                </button>
                            )}
                            {qrLogin.expired && (
                                <button
                                    type="button"
                                    onClick={() => void beginQrSession(qrLogin.providerId, qrLogin.method, qrLogin.methods, qrLogin.canReturnToMethods)}
                                    className="px-4 py-2 rounded-full text-[13px] font-medium"
                                    style={{ background: tokens.primaryBtnBg, color: tokens.primaryBtnText }}
                                >
                                    刷新二维码
                                </button>
                            )}
                        </div>
                    </div>
                </MobileSheet>
            )}
        </motion.div>,
        document.body,
    );
}

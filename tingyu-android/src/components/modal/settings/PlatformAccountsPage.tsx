import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, CheckCircle2, AlertCircle, UserRound, LogOut, RefreshCw, LogIn } from 'lucide-react';
import { omni } from '../../../services/onlineMusic/omni';
import { useOnlineProviderAccountStore } from '../../../stores/useOnlineProviderAccountStore';
import { useSettingsModalStore } from '../../../stores/useSettingsModalStore';
import { registerModalBack, runTopModalBack } from '../../../services/modalBackStack';
import type { OnlineProviderId } from '../../../types/onlineMusic';
import MobileSheet from '../../shared/MobileSheet';
import { useSheetThemeTokens } from '../../../library/suites/mobile/native/sheetThemeTokens';

// src/components/modal/settings/PlatformAccountsPage.tsx
const BRAND_STYLES: Record<string, { bg: string; fg: string; abbr: string }> = {
    netease: { bg: '#E60026', fg: '#FFFFFF', abbr: '云' },
    qq: { bg: '#12B76A', fg: '#FFFFFF', abbr: 'QQ' },
    kugou: { bg: '#0C84FF', fg: '#FFFFFF', abbr: '酷' },
    bodian: { bg: '#5B6CFF', fg: '#FFFFFF', abbr: '波' },
    qishui: { bg: '#00C2B3', fg: '#FFFFFF', abbr: '汽' },
};

export default function PlatformAccountsPage({ onClose }: { onClose: () => void }) {
    const tokens = useSheetThemeTokens();
    const accounts = useOnlineProviderAccountStore(s => s.accounts);
    useSyncExternalStore(omni.subscribeProviders, omni.getProviderRegistryVersion);
    const providers = omni.getProviderSummaries();
    const fromIndex = useSettingsModalStore(s => s.settingsModalState.returnToIndex);
    const back = () => fromIndex ? useSettingsModalStore.getState().returnSettingsToIndex() : onClose();

    const [managingId, setManagingId] = useState<OnlineProviderId | null>(null);
    const [confirmLogoutId, setConfirmLogoutId] = useState<OnlineProviderId | null>(null);
    const [qrLogin, setQrLogin] = useState<{ providerId: OnlineProviderId; imageUrl: string; statusText: string } | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [notice, setNotice] = useState('');

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
    }, [fromIndex, onClose]);

    const startProviderLogin = async (providerId: OnlineProviderId) => {
        setNotice('');
        setBusyId(providerId);
        try {
            const methods = omni.getQrLoginMethods(providerId);
            const qr = await omni.createQrLogin(providerId, methods[0]?.id);
            if (!qr?.key || !qr?.imageUrl) {
                const user = await omni.getLoginStatus(providerId).catch(() => null);
                if (user) {
                    useOnlineProviderAccountStore.getState().updateAccount(providerId, {
                        status: 'authenticated',
                        user,
                        error: undefined,
                        hydration: 'ready',
                        freshness: 'fresh',
                        lastUpdatedAt: Date.now(),
                    });
                    setNotice(`${omni.getProviderLabel(providerId, false)}状态已刷新`);
                } else {
                    setNotice(`${omni.getProviderLabel(providerId, false)}暂未返回二维码，请在独立平台页面登录`);
                }
                return;
            }
            setQrLogin({ providerId, imageUrl: qr.imageUrl, statusText: '请使用对应平台 App 扫码授权' });
            let active = true;
            const poll = async () => {
                for (let attempt = 0; attempt < 45 && active; attempt++) {
                    await new Promise(r => setTimeout(r, 2000));
                    if (!active) break;
                    try {
                        const res = await omni.checkQrLogin(providerId, qr.key);
                        if (res.state === 'confirmed') {
                            const user = await omni.getLoginStatus(providerId).catch(() => null);
                            useOnlineProviderAccountStore.getState().updateAccount(providerId, {
                                status: 'authenticated',
                                user: user ?? null,
                                error: undefined,
                                hydration: 'ready',
                                freshness: 'fresh',
                                lastUpdatedAt: Date.now(),
                            });
                            setQrLogin(null);
                            setNotice(`${omni.getProviderLabel(providerId, false)}登录成功`);
                            return;
                        }
                        if (res.state === 'expired') {
                            setQrLogin(cur => cur ? { ...cur, statusText: '二维码已过期，请关闭重试' } : null);
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
            setNotice(`${omni.getProviderLabel(providerId, false)}登录未完成，请重试`);
        } finally {
            setBusyId(null);
        }
    };

    const performLogout = async (providerId: OnlineProviderId) => {
        setBusyId(providerId);
        setNotice('');
        try {
            await omni.logout(providerId);
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
        <div
            className="fixed inset-0 overflow-y-auto"
            style={{
                zIndex: 136,
                background: tokens.pageBg,
                color: tokens.text,
                paddingTop: 'env(safe-area-inset-top, 16px)',
                paddingBottom: 'max(32px, env(safe-area-inset-bottom, 24px))',
            }}
            data-folia-settings-overlay="true"
            data-folia-keyboard-window="true"
        >
            <div style={{ paddingLeft: 20, paddingRight: 20 }}>
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
                        const loggedIn = account?.status === 'authenticated' && Boolean(account?.user);
                        const expired = account?.status === 'error' || Boolean(account?.error);
                        const brand = BRAND_STYLES[provider.providerId] ?? { bg: tokens.accent, fg: '#FFFFFF', abbr: provider.displayName.slice(0, 1) };
                        const label = omni.getProviderLabel(provider.providerId, false);
                        const statusText = loggedIn
                            ? (account?.user?.nickname || String(account?.user?.id ?? '') || '已登录')
                            : expired
                                ? '登录已失效，请重新授权'
                                : '未登录（可使用公开推荐与搜索）';

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
                                        {busyId === provider.providerId ? '处理中' : loggedIn ? '管理' : '登录'}
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
                    subtitle={managingAccount?.user?.nickname ? `当前账号：${managingAccount.user.nickname}` : '已登录'}
                    onClose={() => { setManagingId(null); setConfirmLogoutId(null); }}
                >
                    <div className="flex flex-col gap-2 pb-6">
                        <div
                            className="flex items-center gap-3 rounded-2xl p-3 mb-1"
                            style={{ background: tokens.cardBg, border: `1px solid ${tokens.border}` }}
                        >
                            <UserRound size={20} color={tokens.accent} />
                            <div className="min-w-0 flex-1">
                                <div className="font-medium text-[14px]">
                                    {managingAccount?.user?.nickname || String(managingAccount?.user?.id ?? '') || '已授权账号'}
                                </div>
                                <div className="text-[12px]" style={{ color: tokens.muted }}>
                                    {managingAccount?.lastUpdatedAt
                                        ? `最近同步：${new Date(managingAccount.lastUpdatedAt).toLocaleString()}`
                                        : '登录状态正常'}
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => { const id = managingId; setManagingId(null); void startProviderLogin(id); }}
                            className="flex items-center gap-3 w-full text-left rounded-2xl px-3"
                            style={{ minHeight: 56, background: tokens.cardBg, border: `1px solid ${tokens.border}` }}
                        >
                            <RefreshCw size={18} color={tokens.accent} />
                            <div>
                                <div className="text-[15px] font-medium">重新授权 / 刷新状态</div>
                                <div className="text-[12px]" style={{ color: tokens.muted }}>刷新当前登录凭据与同步权限</div>
                            </div>
                        </button>

                        <button
                            type="button"
                            onClick={() => { const id = managingId; setManagingId(null); void startProviderLogin(id); }}
                            className="flex items-center gap-3 w-full text-left rounded-2xl px-3"
                            style={{ minHeight: 56, background: tokens.cardBg, border: `1px solid ${tokens.border}` }}
                        >
                            <LogIn size={18} color={tokens.accent} />
                            <div>
                                <div className="text-[15px] font-medium">切换账号</div>
                                <div className="text-[12px]" style={{ color: tokens.muted }}>使用其他账号重新登录该平台</div>
                            </div>
                        </button>

                        {confirmLogoutId !== managingId ? (
                            <button
                                type="button"
                                onClick={() => setConfirmLogoutId(managingId)}
                                className="flex items-center gap-3 w-full text-left rounded-2xl px-3 text-red-500"
                                style={{ minHeight: 56, background: tokens.cardBg, border: '1px solid rgba(239,68,68,0.28)' }}
                            >
                                <LogOut size={18} />
                                <div>
                                    <div className="text-[15px] font-medium">退出登录</div>
                                    <div className="text-[12px] opacity-80">清除该平台登录态（不影响当前播放的本地/其他平台歌曲）</div>
                                </div>
                            </button>
                        ) : (
                            <div className="flex items-center justify-between rounded-2xl p-3 border border-red-500/40">
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

            {qrLogin && (
                <MobileSheet
                    title={`登录 ${omni.getProviderLabel(qrLogin.providerId, false)}`}
                    subtitle={qrLogin.statusText}
                    onClose={() => setQrLogin(null)}
                >
                    <div className="flex flex-col items-center py-4 pb-6 gap-3">
                        <img
                            src={qrLogin.imageUrl}
                            alt="登录二维码"
                            className="rounded-2xl bg-white p-2"
                            style={{ width: 200, height: 200, objectFit: 'contain' }}
                        />
                        <p className="text-[12px] m-0" style={{ color: tokens.muted }}>{qrLogin.statusText}</p>
                    </div>
                </MobileSheet>
            )}
        </div>,
        document.body,
    );
}

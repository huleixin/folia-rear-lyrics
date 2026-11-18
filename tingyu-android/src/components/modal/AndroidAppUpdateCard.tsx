import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight, History, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { chromeNative } from '../../services/nativeChrome';

// src/components/modal/AndroidAppUpdateCard.tsx
// 整合于现有「设置 → 系统 → 关于听屿」页面的软件版本、更新通道、检查更新、版本更新日志与开源声明卡片。

type NativeUpdateStatus = {
    currentVersionName: string;
    currentVersionCode: number;
    channel: string;
    checkPhase: 'idle' | 'checking' | 'up_to_date' | 'update_available' | 'check_failed';
    checkMessage: string;
    lastCheckedAtMs: number;
    decisionMode: 'none' | 'optional_update' | 'force_update';
    forceUpdate: boolean;
    latestVersionName?: string;
    latestVersionCode?: number;
    releaseNotes?: string;
    publishedAt?: string;
};

type FoliaUpdatePlugin = {
    getAppUpdateStatus?: () => Promise<NativeUpdateStatus>;
    checkAppUpdate?: () => Promise<NativeUpdateStatus>;
    openAppUpdateDialog?: () => Promise<NativeUpdateStatus>;
    openAppReleaseHistory?: () => Promise<NativeUpdateStatus>;
    setAppUpdateChannel?: (options: { channel: 'stable' | 'testing' }) => Promise<NativeUpdateStatus>;
};

function getFoliaPlugin(): FoliaUpdatePlugin | null {
    return ((window as unknown as { Capacitor?: { Plugins?: { FoliaNative?: FoliaUpdatePlugin } } })
        .Capacitor?.Plugins?.FoliaNative) ?? null;
}

export default function AndroidAppUpdateCard() {
    const [status, setStatus] = useState<NativeUpdateStatus | null>(null);
    const [polling, setPolling] = useState(false);

    const refreshStatus = useCallback(async () => {
        const plugin = getFoliaPlugin();
        if (!plugin?.getAppUpdateStatus) return null;
        try {
            const res = await plugin.getAppUpdateStatus();
            setStatus(res);
            return res;
        } catch {
            return null;
        }
    }, []);

    useEffect(() => {
        void refreshStatus();
    }, [refreshStatus]);

    useEffect(() => {
        if (!polling && status?.checkPhase !== 'checking') return;
        const timer = window.setInterval(() => {
            void refreshStatus().then(next => {
                if (next && next.checkPhase !== 'checking') {
                    setPolling(false);
                }
            });
        }, 450);
        return () => window.clearInterval(timer);
    }, [polling, status?.checkPhase, refreshStatus]);

    const handleCheckUpdate = async () => {
        const plugin = getFoliaPlugin();
        if (!plugin?.checkAppUpdate) {
            setStatus(prev => ({
                currentVersionName: prev?.currentVersionName ?? (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''),
                currentVersionCode: prev?.currentVersionCode ?? 0,
                channel: prev?.channel ?? 'stable',
                checkPhase: 'check_failed',
                checkMessage: '检查更新失败，原生更新服务不可用',
                lastCheckedAtMs: Date.now(),
                decisionMode: 'none',
                forceUpdate: false,
            }));
            return;
        }
        if (status?.decisionMode === 'optional_update' || status?.decisionMode === 'force_update') {
            await plugin.openAppUpdateDialog?.();
            return;
        }
        setPolling(true);
        try {
            const next = await plugin.checkAppUpdate();
            setStatus(next);
        } catch {
            setPolling(false);
            setStatus(prev => prev ? { ...prev, checkPhase: 'check_failed', checkMessage: '检查更新失败，请检查网络后重试' } : null);
        }
    };

    const handleSwitchChannel = async (channel: 'stable' | 'testing') => {
        const plugin = getFoliaPlugin();
        if (!plugin?.setAppUpdateChannel || status?.channel === channel) return;
        setPolling(true);
        try {
            const next = await plugin.setAppUpdateChannel({ channel });
            setStatus(next);
        } catch {
            setPolling(false);
        }
    };

    const handleOpenReleaseHistory = async () => {
        const plugin = getFoliaPlugin();
        await plugin?.openAppReleaseHistory?.();
    };

    const handleOpenLicenses = () => {
        void chromeNative.openThirdPartyLicenses().catch(() => {});
    };

    const currentVer = status?.currentVersionName || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '');
    const activeChannel = status?.channel === 'testing' ? 'testing' : 'stable';
    const channelLabel = activeChannel === 'testing' ? '测试验证通道 (testing)' : '正式稳定通道 (stable)';
    const isChecking = status?.checkPhase === 'checking' || polling;

    const statusLine = (() => {
        if (isChecking) return '正在连接更新节点检查新版本…';
        if (status?.checkPhase === 'check_failed') return status.checkMessage || '检查更新失败，请检查网络后重试';
        if (status?.decisionMode === 'force_update' || status?.decisionMode === 'optional_update') {
            return `发现新版本 v${status.latestVersionName}，点击立即查看更新详情`;
        }
        if (status?.checkPhase === 'up_to_date') return `当前已是最新版本（${channelLabel}）`;
        return `连接听屿官方更新源检测新版本（${channelLabel}）`;
    })();

    const actionTitle = (() => {
        if (isChecking) return '正在检查更新…';
        if (status?.decisionMode === 'force_update' || status?.decisionMode === 'optional_update') {
            return `查看新版本 v${status.latestVersionName}`;
        }
        return '检查更新';
    })();

    return (
        <div className="space-y-3" data-settings-style='{"gap":10}' data-settings-layout="column">
            {/* 1. 当前听屿版本与更新通道切换 */}
            <div
                data-testid="help-current-version-card"
                className="rounded-2xl p-4"
                style={{
                    color: 'var(--text-primary)',
                    background: 'color-mix(in srgb, currentColor 5%, transparent)',
                }}
                data-settings-style='{"gap":10,"radius":16,"padding":[16,14,16,14],"fill":true}'
                data-settings-layout="column"
            >
                <div className="flex items-center gap-3" data-settings-style='{"align":"center","gap":12}' data-settings-layout="row">
                    <Smartphone size={19} className="shrink-0 opacity-80" aria-hidden="true" />
                    <span className="min-w-0 flex-1" data-settings-style='{"grow":true}' data-settings-layout="column">
                        <span className="block text-sm font-semibold" data-settings-style='{"font":14,"weight":600}' data-settings-layout="column">
                            {`当前听屿版本 v${currentVer}`}
                        </span>
                        <span className="mt-0.5 block text-xs opacity-65" data-settings-style='{"font":12,"tone":"muted","margin":[0,2,0,0]}' data-settings-layout="column">
                            {`${status?.currentVersionCode ? `Build ${status.currentVersionCode} · ` : ''}${channelLabel}`}
                        </span>
                    </span>
                </div>
                <div className="flex items-center gap-2" data-settings-style='{"align":"center","gap":8}' data-settings-layout="row">
                    <button
                        type="button"
                        data-testid="help-channel-stable"
                        disabled={isChecking}
                        aria-pressed={activeChannel === 'stable'}
                        onClick={() => void handleSwitchChannel('stable')}
                        className="flex-1 rounded-xl px-3 py-2 text-center text-xs font-semibold transition-colors"
                        data-settings-style={JSON.stringify({
                            grow: true,
                            center: true,
                            radius: 12,
                            padding: [12, 8, 12, 8],
                            font: 12,
                            weight: 600,
                            fill: true,
                            tone: activeChannel === 'stable' ? 'accent' : 'muted',
                            border: activeChannel === 'stable',
                        })}
                        data-settings-layout="row"
                    >
                        正式通道
                    </button>
                    <button
                        type="button"
                        data-testid="help-channel-testing"
                        disabled={isChecking}
                        aria-pressed={activeChannel === 'testing'}
                        onClick={() => void handleSwitchChannel('testing')}
                        className="flex-1 rounded-xl px-3 py-2 text-center text-xs font-semibold transition-colors"
                        data-settings-style={JSON.stringify({
                            grow: true,
                            center: true,
                            radius: 12,
                            padding: [12, 8, 12, 8],
                            font: 12,
                            weight: 600,
                            fill: true,
                            tone: activeChannel === 'testing' ? 'accent' : 'muted',
                            border: activeChannel === 'testing',
                        })}
                        data-settings-layout="row"
                    >
                        测试通道
                    </button>
                </div>
            </div>

            {/* 2. 检查更新 */}
            <button
                type="button"
                data-testid="help-check-update"
                disabled={isChecking}
                onClick={() => void handleCheckUpdate()}
                className="flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-colors disabled:opacity-60"
                style={{
                    color: 'var(--text-primary)',
                    background: 'color-mix(in srgb, currentColor 5%, transparent)',
                }}
                data-settings-style='{"align":"center","gap":12,"radius":16,"padding":[16,14,16,14],"tone":"text","fill":true}'
                data-settings-layout="row"
            >
                <RefreshCw size={19} className={`shrink-0 opacity-80 ${isChecking ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span className="min-w-0 flex-1" data-settings-style='{"grow":true}' data-settings-layout="column">
                    <span className="block text-sm font-semibold" data-settings-style='{"font":14,"weight":600}' data-settings-layout="column">
                        {actionTitle}
                    </span>
                    <span className="mt-0.5 block text-xs opacity-65" data-settings-style='{"font":12,"tone":"muted","margin":[0,2,0,0]}' data-settings-layout="column">
                        {statusLine}
                    </span>
                </span>
                <ChevronRight size={17} className="shrink-0 opacity-45" aria-hidden="true" />
            </button>

            {/* 3. 版本更新日志（仅展示听屿自身真实发布记录） */}
            <button
                type="button"
                data-testid="help-android-release-notes"
                onClick={() => void handleOpenReleaseHistory()}
                className="flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-colors"
                style={{
                    color: 'var(--text-primary)',
                    background: 'color-mix(in srgb, currentColor 5%, transparent)',
                }}
                data-settings-style='{"align":"center","gap":12,"radius":16,"padding":[16,14,16,14],"tone":"text","fill":true}'
                data-settings-layout="row"
            >
                <History size={19} className="shrink-0 opacity-80" aria-hidden="true" />
                <span className="min-w-0 flex-1" data-settings-style='{"grow":true}' data-settings-layout="column">
                    <span className="block text-sm font-semibold" data-settings-style='{"font":14,"weight":600}' data-settings-layout="column">
                        版本更新日志
                    </span>
                    <span className="mt-0.5 block text-xs opacity-60" data-settings-style='{"font":12,"tone":"muted","margin":[0,2,0,0]}' data-settings-layout="column">
                        查看听屿各版本真实发布记录与修复说明
                    </span>
                </span>
                <ChevronRight size={17} className="shrink-0 opacity-45" aria-hidden="true" />
            </button>

            {/* 4. 开源声明（独立展示 AGPL-3.0、Folia 上游来源及第三方开源许可证） */}
            <button
                type="button"
                data-testid="help-open-source-licenses"
                onClick={handleOpenLicenses}
                className="flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-colors"
                style={{
                    color: 'var(--text-primary)',
                    background: 'color-mix(in srgb, currentColor 5%, transparent)',
                }}
                data-settings-style='{"align":"center","gap":12,"radius":16,"padding":[16,14,16,14],"tone":"text","fill":true}'
                data-settings-layout="row"
            >
                <ShieldCheck size={19} className="shrink-0 opacity-80" aria-hidden="true" />
                <span className="min-w-0 flex-1" data-settings-style='{"grow":true}' data-settings-layout="column">
                    <span className="block text-sm font-semibold" data-settings-style='{"font":14,"weight":600}' data-settings-layout="column">
                        开源声明
                    </span>
                    <span className="mt-0.5 block text-xs opacity-60" data-settings-style='{"font":12,"tone":"muted","margin":[0,2,0,0]}' data-settings-layout="column">
                        AGPL-3.0 协议、Folia 衍生来源与第三方开源许可
                    </span>
                </span>
                <ChevronRight size={17} className="shrink-0 opacity-45" aria-hidden="true" />
            </button>
        </div>
    );
}

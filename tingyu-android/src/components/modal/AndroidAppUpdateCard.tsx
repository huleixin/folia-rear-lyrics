import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';

// src/components/modal/AndroidAppUpdateCard.tsx
// 整合于现有「设置 → 系统 → 关于听屿」页面的软件版本与更新卡片（不新增重复关于页，通过 data-settings-layout 原生投影渲染）。

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
};

function getFoliaPlugin(): FoliaUpdatePlugin | null {
    return ((window as unknown as { Capacitor?: { Plugins?: { FoliaNative?: FoliaUpdatePlugin } } })
        .Capacitor?.Plugins?.FoliaNative) ?? null;
}

export default function AndroidAppUpdateCard({
    onOpenReleaseNotes,
}: {
    onOpenReleaseNotes: () => void;
}) {
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

    const currentVer = status?.currentVersionName || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '');
    const channelLabel = status?.channel === 'testing' ? '内部联调渠道 (testing)' : '正式稳定渠道 (stable)';
    const isChecking = status?.checkPhase === 'checking' || polling;

    const statusLine = (() => {
        if (isChecking) return '正在连接更新节点检查新版本…';
        if (status?.checkPhase === 'check_failed') return status.checkMessage || '检查更新失败，请检查网络后重试';
        if (status?.decisionMode === 'force_update' || status?.decisionMode === 'optional_update') {
            return `发现新版本 v${status.latestVersionName}，点击立即查看更新详情`;
        }
        if (status?.checkPhase === 'up_to_date') return '当前已是最新版本';
        return `当前版本 v${currentVer}${status?.currentVersionCode ? ` (${status.currentVersionCode})` : ''} · ${channelLabel}`;
    })();

    const actionTitle = (() => {
        if (isChecking) return '正在检查更新…';
        if (status?.decisionMode === 'force_update' || status?.decisionMode === 'optional_update') {
            return `查看新版本 v${status.latestVersionName}`;
        }
        return '检查更新';
    })();

    return (
        <div className="space-y-3" data-settings-style='{"gap":12}' data-settings-layout="column">
            <button
                type="button"
                data-testid="help-check-update"
                disabled={isChecking}
                onClick={() => void handleCheckUpdate()}
                className="flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-colors disabled:opacity-60"
                style={{
                    color: 'var(--text-primary)',
                    border: '1px solid color-mix(in srgb, currentColor 22%, transparent)',
                    background: 'color-mix(in srgb, currentColor 7%, transparent)',
                }}
                data-settings-style='{"align":"center","gap":12,"radius":16,"padding":[16,16,16,16],"tone":"text","border":true,"fill":true}'
                data-settings-layout="row"
            >
                <RefreshCw size={19} className={`shrink-0 opacity-80 ${isChecking ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span className="min-w-0" data-settings-layout="column">
                    <span className="block text-sm font-semibold" data-settings-style='{"font":14,"weight":600}' data-settings-layout="column">
                        {actionTitle}
                    </span>
                    <span className="mt-0.5 block text-xs opacity-65" data-settings-style='{"font":12,"tone":"muted","margin":[0,2,0,0]}' data-settings-layout="column">
                        {statusLine}
                    </span>
                </span>
            </button>

            <button
                type="button"
                data-testid="help-android-release-notes"
                onClick={onOpenReleaseNotes}
                className="flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-colors"
                style={{
                    color: 'var(--text-primary)',
                    border: '1px solid color-mix(in srgb, currentColor 16%, transparent)',
                    background: 'color-mix(in srgb, currentColor 5%, transparent)',
                }}
                data-settings-style='{"align":"center","gap":12,"radius":16,"padding":[16,16,16,16],"tone":"text","border":true,"fill":true}'
                data-settings-layout="row"
            >
                <Sparkles size={19} className="shrink-0 opacity-75" aria-hidden="true" />
                <span className="min-w-0" data-settings-layout="column">
                    <span className="block text-sm font-semibold" data-settings-style='{"font":14,"weight":600}' data-settings-layout="column">
                        版本更新日志
                    </span>
                    <span className="mt-0.5 block text-xs opacity-60" data-settings-style='{"font":12,"tone":"muted","margin":[0,2,0,0]}' data-settings-layout="column">
                        {`当前版本 v${currentVer} · 发布渠道：${channelLabel}`}
                    </span>
                </span>
            </button>
        </div>
    );
}

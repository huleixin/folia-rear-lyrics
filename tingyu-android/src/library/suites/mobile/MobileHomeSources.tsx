import React, { useCallback, useRef } from 'react';
import { Check, Settings, LogIn, LogOut, RefreshCw, FolderPlus, Import, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LibraryHomeSurfaceProps } from '../../core/contracts/suite';
import { useLibraryAccountProviders } from '../../core/bindings/useLibraryAccount';
import { useLibraryHomeActions } from '../../core/bindings/useLibraryHomeActions';
import { useHomeSourceStore } from '../../../stores/useHomeSourceStore';
import OperationPanel from './native/OperationPanel';
import type { NativePanelActionRow } from '../../../types/nativePanels';

// src/library/suites/mobile/MobileHomeSources.tsx
//
// 音源选择面板（原生化专项·第 21 轮）：原有的 provider 列表与切换语义不变，
// 只把渲染交给 OperationPanel —— Android 上是原生面板，其它平台是同一份声明的 .ml-sheet。
// 切换音源仍然只动首页数据源与账户，不碰播放器（正在播的本地歌继续播）。
export function MobileSourceSheet({
    account,
    onOpenSettings,
    onClose,
    localSongCount,
}: Pick<LibraryHomeSurfaceProps, 'account' | 'onOpenSettings'> & {
    onClose: () => void;
    /** 本地曲库当前歌曲数； undefined 时整个入口隐藏（例如本地库不可用的环境）。 */
    localSongCount?: number;
}) {
    const { t } = useTranslation();
    const { providers, activeProviderId } = useLibraryAccountProviders(account);
    const homeSource = useHomeSourceStore((state) => state.source);
    const setHomeSource = useHomeSourceStore((state) => state.setSource);
    const selectOnlineSource = (providerId: string) => {
        // 切回在线只换首页数据源与账户，不动播放器：正在播的本地歌继续播。
        setHomeSource('online');
        account.selectProvider(providerId);
    };
    const items: NativePanelActionRow[] = [];
    const handlers: Record<string, () => void> = {};
    if (localSongCount !== undefined) {
        items.push({
            id: 'source:local', icon: 'smartphone',
            label: t('mobileLibrary.localMusicSource'),
            hint: t('mobileLibrary.localMusicSourceHint', { count: localSongCount }),
            selected: homeSource === 'local',
        });
        handlers['source:local'] = () => setHomeSource('local');
    }
    providers.forEach(provider => {
        const id = `source:${provider.providerId}`;
        items.push({
            id, label: provider.displayName,
            hint: provider.user?.nickname || provider.error
                || t(provider.status === 'authenticated' ? 'mobileLibrary.connected' : 'mobileLibrary.notConnected'),
            disabled: !provider.availability.configured,
            selected: homeSource === 'online' && provider.providerId === activeProviderId,
        });
        handlers[id] = () => selectOnlineSource(provider.providerId);
    });
    const signedIn = providers.some(
        provider => provider.providerId === activeProviderId && provider.status === 'authenticated'
    );
    items.push({ id: 'login', label: t('mobileLibrary.login'), icon: 'user-round' });
    handlers.login = () => {
        setHomeSource('online');
        void account.startLogin(activeProviderId);
    };
    if (signedIn) {
        items.push({ id: 'logout', label: t('mobileLibrary.logout'), icon: 'activity' });
        handlers.logout = () => void account.logout(activeProviderId);
    }
    items.push({ id: 'settings', label: t('mobileLibrary.settings'), icon: 'settings2' });
    handlers.settings = () => onOpenSettings?.('options');
    return (
        <OperationPanel
            id="home-sources"
            panel={{ title: t('mobileLibrary.sources'), blocks: [{ kind: 'actions', id: 'sources', items }] }}
            onAction={id => { const handler = handlers[id]; onClose(); handler?.(); }}
            onClose={onClose}
        />
    );
}
export function MobileLocalTools({ homeResources }: Pick<LibraryHomeSurfaceProps, 'homeResources'>) {
    const { t } = useTranslation();
    const { snapshot, importBusy } = useLibraryHomeActions(homeResources.actions);
    const file = useRef<HTMLInputElement>(null);
    const imported = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const selected = event.currentTarget.files?.[0];
            if (selected) void homeResources.actions.importPlaylistFile(selected);
            event.currentTarget.value = '';
        },
        [homeResources.actions]
    );
    return (
        <div className="ml-tools">
            <button
                disabled={importBusy}
                onClick={() =>
                    void (snapshot.deviceScanAvailable
                        ? homeResources.actions.scanDeviceMusic()
                        : homeResources.actions.importFolder())
                }
            >
                <FolderPlus size={17} />
                {t('mobileLibrary.importMusic')}
            </button>
            <button
                disabled={importBusy}
                aria-label={t('mobileLibrary.refresh')}
                onClick={() => void homeResources.actions.refreshFolders()}
            >
                <RefreshCw size={18} />
            </button>
            <button
                disabled={snapshot.importingPlaylist}
                aria-label={t('mobileLibrary.importPlaylist')}
                onClick={() => file.current?.click()}
            >
                <Import size={18} />
            </button>
            <input ref={file} hidden type="file" accept=".m3u,.m3u8" onChange={imported} />
        </div>
    );
}

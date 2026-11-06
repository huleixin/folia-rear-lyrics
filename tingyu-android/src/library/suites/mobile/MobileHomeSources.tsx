import React, { useCallback, useRef } from 'react';
import { Check, Settings, LogIn, LogOut, RefreshCw, FolderPlus, Import, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LibraryHomeSurfaceProps } from '../../core/contracts/suite';
import { useLibraryAccountProviders } from '../../core/bindings/useLibraryAccount';
import { useLibraryHomeActions } from '../../core/bindings/useLibraryHomeActions';
import { useHomeSourceStore } from '../../../stores/useHomeSourceStore';
import MobileSheet from './MobileSheet';

// src/library/suites/mobile/MobileHomeSources.tsx
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
    return (
        <MobileSheet title={t('mobileLibrary.sources')} onClose={onClose}>
            {localSongCount !== undefined && (
                <button
                    className="ml-sheet-action"
                    onClick={() => {
                        setHomeSource('local');
                        onClose();
                    }}
                >
                    <Smartphone size={18} />
                    <span>
                        <strong>{t('mobileLibrary.localMusicSource')}</strong>
                        <small>{t('mobileLibrary.localMusicSourceHint', { count: localSongCount })}</small>
                    </span>
                    {homeSource === 'local' && <Check size={20} />}
                </button>
            )}
            {providers.map((provider) => (
                <button
                    key={provider.providerId}
                    className="ml-sheet-action"
                    disabled={!provider.availability.configured}
                    onClick={() => {
                        selectOnlineSource(provider.providerId);
                        onClose();
                    }}
                >
                    <span>
                        <strong>{provider.displayName}</strong>
                        <small>
                            {provider.user?.nickname ||
                                provider.error ||
                                t(
                                    provider.status === 'authenticated'
                                        ? 'mobileLibrary.connected'
                                        : 'mobileLibrary.notConnected'
                                )}
                        </small>
                    </span>
                    {homeSource === 'online' && provider.providerId === activeProviderId && <Check size={20} />}
                </button>
            ))}
            <button
                className="ml-sheet-action"
                onClick={() => {
                    setHomeSource('online');
                    onClose();
                    void account.startLogin(activeProviderId);
                }}
            >
                <LogIn size={18} />
                {t('mobileLibrary.login')}
            </button>
            {providers.some(
                (provider) => provider.providerId === activeProviderId && provider.status === 'authenticated'
            ) && (
                <button
                    className="ml-sheet-action"
                    onClick={() => {
                        onClose();
                        void account.logout(activeProviderId);
                    }}
                >
                    <LogOut size={18} />
                    {t('mobileLibrary.logout')}
                </button>
            )}
            <button
                className="ml-sheet-action"
                onClick={() => {
                    onClose();
                    onOpenSettings?.('options');
                }}
            >
                <Settings size={18} />
                {t('mobileLibrary.settings')}
            </button>
        </MobileSheet>
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

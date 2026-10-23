import React, { useCallback, useRef } from 'react';
import { Check, Settings, LogIn, LogOut, RefreshCw, FolderPlus, Import } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LibraryHomeSurfaceProps } from '../../core/contracts/suite';
import { useLibraryAccountProviders } from '../../core/bindings/useLibraryAccount';
import { useLibraryHomeActions } from '../../core/bindings/useLibraryHomeActions';
import MobileSheet from './MobileSheet';

// src/library/suites/mobile/MobileHomeSources.tsx
export function MobileSourceSheet({
    account,
    onOpenSettings,
    onClose,
}: Pick<LibraryHomeSurfaceProps, 'account' | 'onOpenSettings'> & { onClose: () => void }) {
    const { t } = useTranslation();
    const { providers, activeProviderId } = useLibraryAccountProviders(account);
    return (
        <MobileSheet title={t('mobileLibrary.sources')} onClose={onClose}>
            {providers.map((provider) => (
                <button
                    key={provider.providerId}
                    className="ml-sheet-action"
                    disabled={!provider.availability.configured}
                    onClick={() => {
                        account.selectProvider(provider.providerId);
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
                    {provider.providerId === activeProviderId && <Check size={20} />}
                </button>
            ))}
            <button
                className="ml-sheet-action"
                onClick={() => {
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

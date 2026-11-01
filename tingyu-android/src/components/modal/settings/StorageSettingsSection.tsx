import SmartResourceCacheSettings from './SmartResourceCacheSettings';
import React from 'react';
import { AudioWaveform, Check, ChevronDown, Cloud, Command, Database, Disc3, Download, FolderOpen, HardDrive, Layers, Loader2, Pencil, PlayCircle, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../../../types';
import { getSyncConfig, getSyncStatus, saveSyncConfig, setSyncStatus, subscribeSyncConfig, subscribeSyncStatus } from '../../../services/sync/syncConfig';
import { exportSyncLibraryBundle, importSyncLibraryBundle, isSyncLibraryExportBundle, syncNow, testSyncProviderConnection } from '../../../services/sync/syncCoordinator';
import { createSyncLibraryZipBlob, readSyncLibraryZipFile } from '../../../services/sync/syncArchive';
import { SYNC_PROVIDER, type SyncProviderConfig, type SyncRuntimeStatus } from '../../../services/sync/syncTypes';
import { createSafeObjectUrl } from '../../../utils/blobGuards';
import { formatLocalDateTimeStamp } from '../../../utils/downloadFileName';
import { CustomSelect } from '../../shared/CustomSelect';
import LocalLibraryWatchSection from './LocalLibraryWatchSection';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';
import { openCommandPaletteCommand } from '../../../stores/useAppViewStore';
import { closeSettings } from '../../../stores/useSettingsModalStore';
import { LYRIC_EXPORT_COMMAND_ID } from '../../command-palette/commands/lyricExportCommands';

// src/components/modal/settings/StorageSettingsSection.tsx
// Shared storage and media cache settings used by the main options page and storage subview.

type CacheCategory = 'playlist' | 'lyrics' | 'cover' | 'media' | 'analysis';

type CacheSizes = Record<CacheCategory, string>;

type StorageSettingsSectionProps = {
    cacheDirectory: string;
    cacheDirectoryIsDefault: boolean;
    cacheDirectoryStatus: 'idle' | 'choosing';
    cacheSizes: CacheSizes;
    enableMediaCache: boolean;
    errorTextColor: string;
    isCleaning: string | null;
    isDaylight?: boolean;
    isElectron: boolean;
    mediaCacheLimitGb: number;
    mediaCount: number;
    onChooseCacheDirectory: () => void;
    onClear: (category: CacheCategory) => void;
    onClearAll: () => void;
    onSetMediaCacheLimitGb: (gigabytes: number) => void;
    onToggleMediaCache: (enabled: boolean) => void;
    settingsCardClass: string;
    settingsIconClass?: string;
    theme?: Theme;
    toggleOffBackgroundClass: string;
    useInsetCacheRows?: boolean;
};

const StorageSettingsSection: React.FC<StorageSettingsSectionProps> = ({
    cacheDirectory,
    cacheDirectoryIsDefault,
    cacheDirectoryStatus,
    cacheSizes,
    enableMediaCache,
    errorTextColor,
    isCleaning,
    isDaylight = false,
    isElectron,
    mediaCacheLimitGb,
    mediaCount,
    onChooseCacheDirectory,
    onClear,
    onClearAll,
    onSetMediaCacheLimitGb,
    onToggleMediaCache,
    settingsCardClass,
    settingsIconClass,
    theme,
    toggleOffBackgroundClass,
    useInsetCacheRows = false,
}) => {
    const { t } = useTranslation();
    const [syncConfig, setSyncConfig] = React.useState<SyncProviderConfig>(() => getSyncConfig());
    const [draftSyncConfig, setDraftSyncConfig] = React.useState<SyncProviderConfig>(() => getSyncConfig());
    const [syncStatus, setSyncStatusState] = React.useState<SyncRuntimeStatus>(() => getSyncStatus());
    const [syncAction, setSyncAction] = React.useState<'idle' | 'testing' | 'syncing' | 'syncingSettings' | 'exporting' | 'importing'>('idle');
    const [testResult, setTestResult] = React.useState<'idle' | 'success' | 'error'>('idle');
    const [syncSummaryMsg, setSyncSummaryMsg] = React.useState<string | null>(null);
    const syncImportInputRef = React.useRef<HTMLInputElement | null>(null);
    // Zero is "no ceiling", which is a real answer rather than a missing one, so it gets a label
    // instead of an empty field.
    const cacheLimitOptions = [1, 2, 5, 10, 20, 50, 0].map((gigabytes) => ({
        value: String(gigabytes),
        label: gigabytes === 0 ? (t('options.mediaCacheLimitNone') || 'No limit') : `${gigabytes} GB`,
    }));
    const cacheItems = [
        { id: 'playlist' as const, label: t('options.playlistData') || 'Playlist Data', size: cacheSizes.playlist, icon: Layers },
        { id: 'lyrics' as const, label: t('options.lyrics') || 'Lyrics', size: cacheSizes.lyrics, icon: Command },
        { id: 'cover' as const, label: t('options.covers') || 'Covers', size: cacheSizes.cover, icon: Disc3 },
        { id: 'media' as const, label: t('options.mediaFiles') || 'Media Files', size: cacheSizes.media, icon: PlayCircle },
        { id: 'analysis' as const, label: t('options.analysisData') || 'Analysis Data', size: cacheSizes.analysis, icon: AudioWaveform },
    ];
    const syncConfigDirty = JSON.stringify(syncConfig) !== JSON.stringify(draftSyncConfig);
    const [syncExpanded,setSyncExpanded] = React.useState(syncConfig.enabled);
    const syncConfigured = Boolean(draftSyncConfig.workerBaseUrl.trim() && draftSyncConfig.authToken.trim());
    const syncStatusLabel = syncStatus.state === 'error'
        ? (syncStatus.lastError || t('options.r2SyncStatusError') || 'Sync failed')
        : syncStatus.lastSyncAt
            ? `${t('options.r2SyncLastSync') || 'Last sync'}: ${new Date(syncStatus.lastSyncAt).toLocaleString()}`
            : (t('options.r2SyncStatusIdle') || 'Not synced yet');

    React.useEffect(() => {
        const unsubscribeConfig = subscribeSyncConfig(() => {
            const nextConfig = getSyncConfig();
            setSyncConfig(nextConfig);
            setDraftSyncConfig(nextConfig);
        });
        const unsubscribeStatus = subscribeSyncStatus(() => setSyncStatusState(getSyncStatus()));
        return () => {
            unsubscribeConfig();
            unsubscribeStatus();
        };
    }, []);

    const updateDraftSyncConfig = (patch: Partial<SyncProviderConfig>) => {
        setDraftSyncConfig(prev => ({
            ...prev,
            ...patch,
            provider: SYNC_PROVIDER,
        }));
    };

    const handleSaveSyncConfig = () => {
        saveSyncConfig(draftSyncConfig);
        setSyncConfig(getSyncConfig());
    };

    const handleTestSync = async () => {
        setSyncAction('testing');
        setTestResult('idle');
        setSyncSummaryMsg(null);
        const nextConfig = {
            ...draftSyncConfig,
            workerBaseUrl: draftSyncConfig.workerBaseUrl.trim().replace(/\/+$/, ''),
            authToken: draftSyncConfig.authToken.trim(),
        };
        try {
            const ok = await testSyncProviderConnection(nextConfig);
            if (ok) {
                saveSyncConfig(nextConfig);
                setSyncConfig(getSyncConfig());
                setSyncStatus({ state: 'success', lastSyncAt: new Date().toISOString(), lastError: null });
                setTestResult('success');
                setSyncSummaryMsg(t('ui.storage.syncTestSuccess'));
            } else {
                setTestResult('error');
                setSyncSummaryMsg(t('ui.storage.syncTestFailed'));
            }
        } catch (error) {
            setTestResult('error');
            setSyncSummaryMsg(error instanceof Error ? error.message : String(error));
            setSyncStatus({ state: 'error', lastError: error instanceof Error ? error.message : String(error) });
        } finally {
            setSyncAction('idle');
            setTimeout(() => setTestResult('idle'), 3000);
        }
    };

    const handleSyncNow = async () => {
        if (syncConfigDirty) {
            handleSaveSyncConfig();
        }
        setSyncAction('syncing');
        setSyncSummaryMsg(null);
        try {
            const summary = await syncNow({ syncThemes: true, applyRemoteSettings: false, pushSettings: false });
            if (summary) {
                setSyncSummaryMsg(t('ui.storage.syncThemesComplete', { uploaded: summary.uploadedThemeCount, downloaded: summary.downloadedThemeCount, local: summary.checkedLocalThemeCount, diff: summary.diffBucketCount }));
            }
        } finally {
            setSyncAction('idle');
        }
    };

    const handleSyncSettings = async () => {
        if (syncConfigDirty) {
            handleSaveSyncConfig();
        }
        setSyncAction('syncingSettings');
        setSyncSummaryMsg(null);
        try {
            const summary = await syncNow({ syncThemes: false, applyRemoteSettings: true, pushSettings: true });
            if (summary) {
                const parts = [];
                if (summary.appliedRemoteSettings) parts.push(t('ui.storage.syncAppliedRemote'));
                if (summary.pushedLocalSettings) parts.push(t('ui.storage.syncPushedLocal'));
                setSyncSummaryMsg(parts.length > 0 ? t('ui.storage.syncSettingsComplete', { details: parts.join(', ') }) : t('ui.storage.syncSettingsNoChange'));
            }
        } finally {
            setSyncAction('idle');
        }
    };

    const handleExportSyncLibrary = async () => {
        setSyncAction('exporting');
        try {
            const bundle = await exportSyncLibraryBundle();
            const blob = createSyncLibraryZipBlob(bundle);
            const url = createSafeObjectUrl(blob);
            if (!url) throw new TypeError('Sync export must produce a Blob');
            const link = document.createElement('a');
            link.href = url;
            link.download = `folia-sync-${formatLocalDateTimeStamp()}.zip`;
            link.click();
            URL.revokeObjectURL(url);
        } finally {
            setSyncAction('idle');
        }
    };

    const handleImportSyncLibrary = async (file: File | null) => {
        if (!file) {
            return;
        }

        setSyncAction('importing');
        try {
            const parsed = file.name.toLowerCase().endsWith('.zip')
                ? await readSyncLibraryZipFile(file)
                : JSON.parse(await file.text()) as unknown;
            if (!isSyncLibraryExportBundle(parsed)) {
                throw new Error('Invalid Folia sync export');
            }
            const shouldImport = window.confirm(t('options.r2SyncImportConfirm') || 'Import this sync library and overwrite local sync cache?');
            if (!shouldImport) {
                return;
            }
            await importSyncLibraryBundle(parsed, {
                pushRemote: draftSyncConfig.enabled && syncConfigured,
            });
        } catch (error) {
            setSyncStatus({ state: 'error', lastError: error instanceof Error ? error.message : String(error) });
        } finally {
            setSyncAction('idle');
            if (syncImportInputRef.current) {
                syncImportInputRef.current.value = '';
            }
        }
    };

    return (
        <div className="storage-settings">
            <SmartResourceCacheSettings />
            <SettingsAnchor anchorId="cacheDetails" label={t('options.cacheDetails') || 'Cache Details'}>
                <h3 className="storage-section-heading"><span><Database size={16}/>{t('options.cacheDetails')}</span><button type="button" className="storage-text-button" onClick={onClearAll} disabled={isCleaning === 'all'}>{isCleaning === 'all' ? <Loader2 size={14} className="animate-spin"/> : <Trash2 size={14}/>} {t('options.clearAll')}</button></h3>
                <div className="cache-details-grid">
                    {cacheItems.map(item=><div key={item.id} className="cache-detail-row">
                        <div className="cache-detail-info"><span className="storage-icon"><item.icon size={18}/></span><div><div className="cache-detail-title">{item.label}</div><div className="cache-detail-size">{item.size}</div></div></div>
                        <div className="cache-detail-actions">
                            {item.id==='lyrics'&&<button type="button" data-ponder-lyric-export-settings-entry onClick={()=>{openCommandPaletteCommand(LYRIC_EXPORT_COMMAND_ID);closeSettings();}} title={t('lyricExport.settingsEntry')} aria-label={t('lyricExport.settingsEntry')}><Download size={17}/></button>}
                            <button type="button" onClick={()=>onClear(item.id)} disabled={isCleaning===item.id} title={`${t('ui.clear')} ${item.label}`} aria-label={`${t('ui.clear')} ${item.label}`}>{isCleaning===item.id?<Loader2 size={17} className="animate-spin"/>:<Trash2 size={17}/>}</button>
                        </div>
                    </div>)}
                </div>
            </SettingsAnchor>
            <SettingsAnchor anchorId="r2Sync" label={t('options.r2Sync') || 'Sync Server'}>
                <SettingsSectionHeading icon={Cloud} label={t('options.r2Sync') || 'Sync Server'} />
                <div className="storage-sync-card">
                    <div className="storage-sync-summary"><div><h4>{t('options.r2SyncEnable')}</h4><p>在设备间同步主题与外观设置</p></div><button type="button" className="resource-switch" role="switch" aria-label={t('options.r2SyncEnable')} aria-checked={draftSyncConfig.enabled} onClick={()=>{updateDraftSyncConfig({enabled:!draftSyncConfig.enabled});setSyncExpanded(true);}}><span/></button></div>
                    <button type="button" className="storage-text-button" aria-label="服务器设置" aria-expanded={syncExpanded} onClick={()=>setSyncExpanded(!syncExpanded)}>服务器设置{syncConfigDirty?' · 未保存':''}<ChevronDown size={16} style={{transform:syncExpanded?'rotate(180deg)':undefined}}/></button>
                    {syncExpanded&&<div className="storage-sync-config">
                        <p className="storage-sync-help">{t('options.r2SyncEnableDesc')} <a href="https://folia-site.cielaniska.top/guide/deploy-sync" target="_blank" rel="noopener noreferrer">{t('options.r2SyncDeployDocs')}</a></p>
                        <label><span>{t('options.r2SyncWorkerUrl')}</span><input type="url" value={draftSyncConfig.workerBaseUrl} onChange={event=>updateDraftSyncConfig({workerBaseUrl:event.target.value})} placeholder="https://your-server.workers.dev"/></label>
                        <label><span>{t('options.r2SyncToken')}</span><input type="password" value={draftSyncConfig.authToken} onChange={event=>updateDraftSyncConfig({authToken:event.target.value})} placeholder={t('options.r2SyncTokenPlaceholder')}/></label>
                        <div className="storage-sync-actions">
                            <button type="button" className="storage-button" onClick={handleSaveSyncConfig} disabled={!syncConfigDirty}><Check size={16}/>{t('options.r2SyncSave')}</button>
                            <button type="button" className="storage-button" onClick={()=>void handleTestSync()} disabled={!syncConfigured||syncAction!=='idle'}>{syncAction==='testing'?<Loader2 size={16} className="animate-spin"/>:testResult==='success'?<Check size={16}/>:testResult==='error'?<X size={16}/>:<Cloud size={16}/>} {t('options.r2SyncTest')}</button>
                        </div>
                    </div>}
                    {draftSyncConfig.enabled&&<div className="storage-sync-actions">
                        <button type="button" className="storage-button storage-button-primary" onClick={()=>void handleSyncNow()} disabled={!syncConfigured||syncAction!=='idle'}>{syncAction==='syncing'?<Loader2 size={16} className="animate-spin"/>:<RefreshCw size={16}/>} {t('options.r2SyncNow')}</button>
                        <button type="button" className="storage-button storage-button-primary" onClick={()=>void handleSyncSettings()} disabled={!syncConfigured||syncAction!=='idle'}>{syncAction==='syncingSettings'?<Loader2 size={16} className="animate-spin"/>:<Layers size={16}/>} {t('options.syncVisualSettings')}</button>
                    </div>}
                    <div className="storage-sync-backup"><p>本地备份</p><div className="storage-sync-actions">
                        <button type="button" className="storage-button" onClick={()=>void handleExportSyncLibrary()} disabled={syncAction!=='idle'}>{syncAction==='exporting'?<Loader2 size={16} className="animate-spin"/>:<Download size={16}/>} {t('options.r2SyncExportLibrary')}</button>
                        <button type="button" className="storage-button" onClick={()=>syncImportInputRef.current?.click()} disabled={syncAction!=='idle'}>{syncAction==='importing'?<Loader2 size={16} className="animate-spin"/>:<Upload size={16}/>} {t('options.r2SyncImportLibrary')}</button>
                    </div></div>
                    <input ref={syncImportInputRef} type="file" accept="application/zip,.zip,application/json,.json" className="hidden" onChange={event=>void handleImportSyncLibrary(event.target.files?.[0]??null)}/>
                    {(draftSyncConfig.enabled||syncSummaryMsg||syncStatus.state==='error')&&<p role="status" className={`storage-sync-status ${syncStatus.state==='error'||testResult==='error'?'storage-error':''}`}>{syncSummaryMsg||syncStatusLabel}</p>}
                </div>
            </SettingsAnchor>

            <LocalLibraryWatchSection
                errorTextColor={errorTextColor}
                settingsCardClass={settingsCardClass}
                theme={theme}
                toggleOffBackgroundClass={toggleOffBackgroundClass}
            />

            <SettingsAnchor anchorId="mediaCache" label={t('options.mediaCache') || 'Media Cache'}>
                <SettingsSectionHeading icon={Database} label={t('options.mediaCache') || 'Media Cache'} />
                <div className={`p-4 rounded-xl border space-y-4 ${settingsCardClass}`}>
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                {t('options.enableMediaCache') || 'Cache Songs'}
                            </div>
                            <div className="resource-hint" style={{ color: 'var(--text-secondary)' }}>
                                {t('options.enableMediaCacheDesc') || 'Cache audio after playback for offline listening.'}
                            </div>
                        </div>
                        <button type="button" role="switch" aria-label={t('options.enableMediaCache')} aria-checked={enableMediaCache} onClick={()=>onToggleMediaCache(!enableMediaCache)} className="resource-switch"><span/></button>
                    </div>

                    {isElectron && (
                        <div className="pt-3 border-t border-white/10 space-y-3">
                            <div className="space-y-1">
                                <div className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                                    <FolderOpen size={14} />
                                    {t('options.cacheDirectory') || 'Cache Directory'}
                                </div>
                                <div className="text-xs opacity-50" style={{ color: 'var(--text-secondary)' }}>
                                    {t('options.cacheDirectoryDesc') || 'Choose where large desktop cache files should be stored.'}
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <div className="flex-1 bg-black/10 rounded-lg border border-white/5 px-3 py-2 min-w-0">
                                    <div className="text-[11px] break-all font-mono" style={{ color: 'var(--text-primary)' }}>
                                        {cacheDirectory || '...'}
                                    </div>
                                    <div className="text-[10px] opacity-45 mt-1" style={{ color: 'var(--text-secondary)' }}>
                                        {cacheDirectoryIsDefault
                                            ? (t('options.cacheDirectoryDefaultHint') || 'Using the default desktop cache location.')
                                            : (t('options.cacheDirectoryCustomHint') || 'Using a custom cache location.')}
                                    </div>
                                </div>
                                <button
                                    onClick={onChooseCacheDirectory}
                                    disabled={cacheDirectoryStatus !== 'idle'}
                                    className="shrink-0 w-12 rounded-lg text-sm font-medium transition-colors flex items-center justify-center bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{ color: 'var(--text-primary)' }}
                                    title={t('options.chooseCacheDirectory') || 'Choose Folder'}
                                    aria-label={t('options.chooseCacheDirectory') || 'Choose Folder'}
                                >
                                    {cacheDirectoryStatus === 'choosing' ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
                                </button>
                            </div>
                        </div>
                    )}

                    {isElectron && (
                        <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-4">
                            <div className="space-y-1">
                                <div className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                                    <HardDrive size={14} />
                                    {t('options.mediaCacheLimit') || 'Cache Limit'}
                                </div>
                                <div className="text-xs opacity-50 max-w-[240px]" style={{ color: 'var(--text-secondary)' }}>
                                    {t('options.mediaCacheLimitDesc') || 'Once past this, the songs you have not played in longest are dropped first.'}
                                </div>
                            </div>
                            <div className="w-32 shrink-0">
                                <CustomSelect
                                    value={String(mediaCacheLimitGb)}
                                    onChange={(value) => onSetMediaCacheLimitGb(Number(value))}
                                    options={cacheLimitOptions}
                                    ariaLabel={t('options.mediaCacheLimit') || 'Cache Limit'}
                                    isDaylight={isDaylight}
                                    theme={theme}
                                />
                            </div>
                        </div>
                    )}

                    <div className="pt-3 border-t border-white/10 flex justify-between items-center text-xs opacity-50">
                        <span>{t('options.cachedSongsCount') || 'Cached Songs'}:</span>
                        <span className="font-mono">{mediaCount} · {cacheSizes.media}</span>
                    </div>
                </div>
            </SettingsAnchor>
        </div>
    );
};

export default StorageSettingsSection;

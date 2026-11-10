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
        <div className="storage-settings" data-settings-style='{"gap":28}' data-settings-layout="column">
            <SmartResourceCacheSettings />
            <SettingsAnchor anchorId="cacheDetails" label={t('options.cacheDetails') || 'Cache Details'} nativeLayout={{"kind":"column"}}>
                <h3 className="storage-section-heading" data-settings-style='{"align":"between","font":13,"weight":600,"tone":"muted","margin":[2,0,2,10]}' data-settings-layout="row"><span data-settings-style='{"grow":true}' data-settings-layout="wrap"><Database size={16}/>{t('options.cacheDetails')}</span><button type="button" className="storage-text-button" onClick={onClearAll} disabled={isCleaning === 'all'} data-settings-layout="row" data-settings-style='{"gap":6,"minHeight":44,"font":13,"tone":"muted"}'>{isCleaning === 'all' ? <Loader2 size={14} className="animate-spin"/> : <Trash2 size={14}/>} {t('options.clearAll')}</button></h3>
                <div className="cache-details-grid" data-settings-style='{"padding":[16,0,16,0],"radius":20,"border":true}' data-settings-layout="card">
                    {cacheItems.map(item=><div key={item.id} className="cache-detail-row" data-settings-style='{"align":"center","gap":10,"minHeight":68,"padding":[0,10,0,10],"divider":true}' data-settings-layout="row">
                        <div className="cache-detail-info" data-settings-style='{"align":"center","gap":12,"grow":true}' data-settings-layout="row"><span className="storage-icon" data-settings-style='{"width":36,"height":36,"align":"center","center":true,"radius":12,"fill":true}' data-settings-layout="row"><item.icon size={18}/></span><div data-settings-layout="column"><div className="cache-detail-title" data-settings-style='{"font":14}' data-settings-layout="column">{item.label}</div><div className="cache-detail-size" data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">{item.size}</div></div></div>
                        <div className="cache-detail-actions" data-settings-style='{"align":"center"}' data-settings-layout="row">
                            {item.id==='lyrics'&&<button type="button" data-ponder-lyric-export-settings-entry onClick={()=>{openCommandPaletteCommand(LYRIC_EXPORT_COMMAND_ID);closeSettings();}} title={t('lyricExport.settingsEntry')} aria-label={t('lyricExport.settingsEntry')} data-settings-layout="row" data-settings-style='{"width":40,"minHeight":44,"center":true}'><Download size={17}/></button>}
                            <button type="button" onClick={()=>onClear(item.id)} disabled={isCleaning===item.id} title={`${t('ui.clear')} ${item.label}`} aria-label={`${t('ui.clear')} ${item.label}`} data-settings-layout="row" data-settings-style='{"width":40,"minHeight":44,"center":true}'>{isCleaning===item.id?<Loader2 size={17} className="animate-spin"/>:<Trash2 size={17}/>}</button>
                        </div>
                    </div>)}
                </div>
            </SettingsAnchor>
            <SettingsAnchor anchorId="r2Sync" label={t('options.r2Sync') || 'Sync Server'} nativeLayout={{"kind":"column"}}>
                <SettingsSectionHeading icon={Cloud} label={t('options.r2Sync') || 'Sync Server'} />
                <div className="storage-sync-card" data-settings-style='{"padding":[18,18,18,18],"gap":16,"radius":20,"border":true}' data-settings-layout="card">
                    <div className="storage-sync-summary" data-settings-style='{"gap":16,"align":"between"}' data-settings-layout="row"><div data-settings-style='{"grow":true}' data-settings-layout="column"><h4 data-settings-style='{"font":14,"weight":600}' data-settings-layout="wrap">{t('options.r2SyncEnable')}</h4><p data-settings-layout="wrap">在设备间同步主题与外观设置</p></div><button type="button" className="resource-switch" role="switch" aria-label={t('options.r2SyncEnable')} aria-checked={draftSyncConfig.enabled} onClick={()=>{updateDraftSyncConfig({enabled:!draftSyncConfig.enabled});setSyncExpanded(true);}} data-settings-layout="row"><span data-settings-layout="wrap"/></button></div>
                    <button type="button" className="storage-text-button" aria-label="服务器设置" aria-expanded={syncExpanded} onClick={()=>setSyncExpanded(!syncExpanded)} data-settings-layout="row" data-settings-style='{"gap":6,"minHeight":44,"font":13,"tone":"muted"}'>服务器设置{syncConfigDirty?' · 未保存':''}<ChevronDown size={16} style={{transform:syncExpanded?'rotate(180deg)':undefined}}/></button>
                    {syncExpanded&&<div className="storage-sync-config" data-settings-style='{"gap":14,"padding":[0,16,0,0]}' data-settings-layout="column">
                        <p className="storage-sync-help" data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="wrap">{t('options.r2SyncEnableDesc')} <a href="https://folia-site.cielaniska.top/guide/deploy-sync" target="_blank" rel="noopener noreferrer" data-settings-layout="wrap">{t('options.r2SyncDeployDocs')}</a></p>
                        <label data-settings-layout="wrap"><span data-settings-layout="wrap">{t('options.r2SyncWorkerUrl')}</span><input type="url" value={draftSyncConfig.workerBaseUrl} onChange={event=>updateDraftSyncConfig({workerBaseUrl:event.target.value})} placeholder="https://your-server.workers.dev" data-settings-layout="column"/></label>
                        <label data-settings-layout="wrap"><span data-settings-layout="wrap">{t('options.r2SyncToken')}</span><input type="password" value={draftSyncConfig.authToken} onChange={event=>updateDraftSyncConfig({authToken:event.target.value})} placeholder={t('options.r2SyncTokenPlaceholder')} data-settings-layout="column"/></label>
                        <div className="storage-sync-actions" data-settings-style='{"columns":2,"gap":10}' data-settings-layout="grid">
                            <button type="button" className="storage-button" onClick={handleSaveSyncConfig} disabled={!syncConfigDirty} data-settings-layout="row" data-settings-style='{"center":true,"minHeight":44,"radius":12,"border":true,"fill":true,"padding":[14,9,14,9],"gap":8,"font":13}'><Check size={16}/>{t('options.r2SyncSave')}</button>
                            <button type="button" className="storage-button" onClick={()=>void handleTestSync()} disabled={!syncConfigured||syncAction!=='idle'} data-settings-layout="row" data-settings-style='{"center":true,"minHeight":44,"radius":12,"border":true,"fill":true,"padding":[14,9,14,9],"gap":8,"font":13}'>{syncAction==='testing'?<Loader2 size={16} className="animate-spin"/>:testResult==='success'?<Check size={16}/>:testResult==='error'?<X size={16}/>:<Cloud size={16}/>} {t('options.r2SyncTest')}</button>
                        </div>
                    </div>}
                    {draftSyncConfig.enabled&&<div className="storage-sync-actions" data-settings-style='{"columns":2,"gap":10}' data-settings-layout="grid">
                        <button type="button" className="storage-button storage-button-primary" onClick={()=>void handleSyncNow()} disabled={!syncConfigured||syncAction!=='idle'} data-settings-layout="row" data-settings-style='{"center":true,"minHeight":44,"radius":12,"border":true,"fill":true,"padding":[14,9,14,9],"gap":8,"font":13}'>{syncAction==='syncing'?<Loader2 size={16} className="animate-spin"/>:<RefreshCw size={16}/>} {t('options.r2SyncNow')}</button>
                        <button type="button" className="storage-button storage-button-primary" onClick={()=>void handleSyncSettings()} disabled={!syncConfigured||syncAction!=='idle'} data-settings-layout="row" data-settings-style='{"center":true,"minHeight":44,"radius":12,"border":true,"fill":true,"padding":[14,9,14,9],"gap":8,"font":13}'>{syncAction==='syncingSettings'?<Loader2 size={16} className="animate-spin"/>:<Layers size={16}/>} {t('options.syncVisualSettings')}</button>
                    </div>}
                    <div className="storage-sync-backup" data-settings-style='{"gap":10,"padding":[0,14,0,0]}' data-settings-layout="column"><p data-settings-layout="wrap">本地备份</p><div className="storage-sync-actions" data-settings-style='{"columns":2,"gap":10}' data-settings-layout="grid">
                        <button type="button" className="storage-button" onClick={()=>void handleExportSyncLibrary()} disabled={syncAction!=='idle'} data-settings-layout="row" data-settings-style='{"center":true,"minHeight":44,"radius":12,"border":true,"fill":true,"padding":[14,9,14,9],"gap":8,"font":13}'>{syncAction==='exporting'?<Loader2 size={16} className="animate-spin"/>:<Download size={16}/>} {t('options.r2SyncExportLibrary')}</button>
                        <button type="button" className="storage-button" onClick={()=>syncImportInputRef.current?.click()} disabled={syncAction!=='idle'} data-settings-layout="row" data-settings-style='{"center":true,"minHeight":44,"radius":12,"border":true,"fill":true,"padding":[14,9,14,9],"gap":8,"font":13}'>{syncAction==='importing'?<Loader2 size={16} className="animate-spin"/>:<Upload size={16}/>} {t('options.r2SyncImportLibrary')}</button>
                    </div></div>
                    <input ref={syncImportInputRef} type="file" accept="application/zip,.zip,application/json,.json" className="hidden" onChange={event=>void handleImportSyncLibrary(event.target.files?.[0]??null)} data-settings-layout="column"/>
                    {(draftSyncConfig.enabled||syncSummaryMsg||syncStatus.state==='error')&&<p role="status" className={`storage-sync-status ${syncStatus.state==='error'||testResult==='error'?'storage-error':''}`} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="wrap">{syncSummaryMsg||syncStatusLabel}</p>}
                </div>
            </SettingsAnchor>

            <LocalLibraryWatchSection
                errorTextColor={errorTextColor}
                settingsCardClass={settingsCardClass}
                theme={theme}
                toggleOffBackgroundClass={toggleOffBackgroundClass}
            />

            <SettingsAnchor anchorId="mediaCache" label={t('options.mediaCache') || 'Media Cache'} nativeLayout={{"kind":"column"}}>
                <SettingsSectionHeading icon={Database} label={t('options.mediaCache') || 'Media Cache'} />
                <div className={`p-4 rounded-xl border space-y-4 ${settingsCardClass}`} data-settings-style='{"radius":12,"border":true,"gap":16,"padding":[16,16,16,16]}' data-settings-layout="card">
                    <div className="flex items-center justify-between" data-settings-style='{"align":"between"}' data-settings-layout="row">
                        <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                {t('options.enableMediaCache') || 'Cache Songs'}
                            </div>
                            <div className="resource-hint" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"tone":"muted","font":12}' data-settings-layout="column">
                                {t('options.enableMediaCacheDesc') || 'Cache audio after playback for offline listening.'}
                            </div>
                        </div>
                        <button type="button" role="switch" aria-label={t('options.enableMediaCache')} aria-checked={enableMediaCache} onClick={()=>onToggleMediaCache(!enableMediaCache)} className="resource-switch" data-settings-layout="row"><span data-settings-layout="wrap"/></button>
                    </div>

                    {isElectron && (
                        <div className="pt-3 border-t border-white/10 space-y-3" data-settings-style='{"gap":12,"padding":[0,12,0,0]}' data-settings-layout="column">
                            <div className="space-y-1" data-settings-style='{"gap":4}' data-settings-layout="column">
                                <div className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }} data-settings-style='{"align":"center","font":14,"weight":500,"gap":8,"tone":"text"}' data-settings-layout="row">
                                    <FolderOpen size={14} />
                                    {t('options.cacheDirectory') || 'Cache Directory'}
                                </div>
                                <div className="text-xs opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                                    {t('options.cacheDirectoryDesc') || 'Choose where large desktop cache files should be stored.'}
                                </div>
                            </div>

                            <div className="flex gap-2" data-settings-style='{"gap":8}' data-settings-layout="row">
                                <div className="flex-1 bg-black/10 rounded-lg border border-white/5 px-3 py-2 min-w-0" data-settings-style='{"grow":true,"fill":true,"radius":8,"border":true,"padding":[12,8,12,8]}' data-settings-layout="card">
                                    <div className="text-[11px] break-all font-mono" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":11,"tone":"text"}' data-settings-layout="column">
                                        {cacheDirectory || '...'}
                                    </div>
                                    <div className="text-[10px] opacity-45 mt-1" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":10,"tone":"muted","margin":[0,4,0,0]}' data-settings-layout="column">
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
                                 data-settings-style='{"align":"center","center":true,"width":48,"radius":8,"font":14,"weight":500,"fill":true,"tone":"text"}' data-settings-layout="row">
                                    {cacheDirectoryStatus === 'choosing' ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
                                </button>
                            </div>
                        </div>
                    )}

                    {isElectron && (
                        <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-4" data-settings-style='{"align":"between","gap":16,"padding":[0,12,0,0]}' data-settings-layout="row">
                            <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                                <div className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }} data-settings-style='{"align":"center","font":14,"weight":500,"gap":8,"tone":"text"}' data-settings-layout="row">
                                    <HardDrive size={14} />
                                    {t('options.mediaCacheLimit') || 'Cache Limit'}
                                </div>
                                <div className="text-xs opacity-50 max-w-[240px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                                    {t('options.mediaCacheLimitDesc') || 'Once past this, the songs you have not played in longest are dropped first.'}
                                </div>
                            </div>
                            <div className="w-32 shrink-0" data-settings-style='{"width":128}' data-settings-layout="column">
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

                    <div className="pt-3 border-t border-white/10 flex justify-between items-center text-xs opacity-50" data-settings-style='{"align":"between","font":12,"tone":"muted","padding":[0,12,0,0]}' data-settings-layout="row">
                        <span data-settings-style='{"grow":true}' data-settings-layout="wrap">{t('options.cachedSongsCount') || 'Cached Songs'}:</span>
                        <span className="font-mono" data-settings-layout="wrap">{mediaCount} · {cacheSizes.media}</span>
                    </div>
                </div>
            </SettingsAnchor>
        </div>
    );
};

export default StorageSettingsSection;

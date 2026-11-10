import React from 'react';
import { AlertTriangle, Eye, FolderSearch, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../../../types';
import type { LocalLibraryAutoScanRootState } from '../../../types/localLibraryWatch';
import { refreshLocalLibraryAutoScanRoots } from '../../../services/localLibraryAutoScan';
import { useLocalLibraryAutoScanState } from '../../../hooks/useLocalLibraryAutoScan';
import { useLocalLibrarySettingsStore } from '../../../stores/useLocalLibrarySettingsStore';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';

// src/components/modal/settings/LocalLibraryWatchSection.tsx
// Storage subview section for the local folder watcher: the toggle plus the live per-folder watch
// state, so a folder that is silently not being watched says so instead of just never rescanning.

type LocalLibraryWatchSectionProps = {
    /** Tailwind class set the storage subview already uses for error text. */
    errorTextColor: string;
    settingsCardClass: string;
    theme?: Theme;
    toggleOffBackgroundClass: string;
};

const LocalLibraryWatchSection: React.FC<LocalLibraryWatchSectionProps> = ({
    errorTextColor,
    settingsCardClass,
    theme,
    toggleOffBackgroundClass,
}) => {
    const { t } = useTranslation();
    const autoScanEnabled = useLocalLibrarySettingsStore(state => state.autoScanEnabled);
    const setAutoScanEnabled = useLocalLibrarySettingsStore(state => state.setAutoScanEnabled);
    const autoScan = useLocalLibraryAutoScanState();

    // Hidden wherever FileSystemObserver has not shipped; there is nothing to configure there.
    if (!autoScan.supported) {
        return null;
    }

    const describeRoot = (root: LocalLibraryAutoScanRootState): { text: string; warning: boolean; } => {
        if (root.skipReason === 'permission') {
            return { text: t('options.localLibraryWatchNoPermission') || 'Access expired. Re-import this folder to watch it.', warning: true };
        }
        if (root.error) {
            return { text: `${t('options.localLibraryWatchFailed') || 'Watch failed'}: ${root.error}`, warning: true };
        }
        if (!root.watching) {
            return { text: t('options.localLibraryWatchStarting') || 'Starting the watch...', warning: false };
        }
        if (!root.recursive) {
            return { text: t('options.localLibraryWatchRootOnly') || 'Watching this folder only; subfolders are not covered.', warning: true };
        }
        return { text: t('options.localLibraryWatchActive') || 'Watching this folder and its subfolders.', warning: false };
    };

    const lastScanLabel = autoScan.lastScanAt
        ? `${t('options.localLibraryWatchLastScan') || 'Last auto scan'}: ${new Date(autoScan.lastScanAt).toLocaleString()}`
        : (t('options.localLibraryWatchNeverScanned') || 'No automatic scan has run yet.');

    return (
        <SettingsAnchor anchorId="localLibraryWatch" label={t('options.localLibraryWatch') || 'Local Folder Watch'} nativeLayout={{"kind":"column"}}>
            <SettingsSectionHeading icon={FolderSearch} label={t('options.localLibraryWatch') || 'Local Folder Watch'} />
            <div className={`p-4 rounded-xl border space-y-4 ${settingsCardClass}`} data-settings-style='{"radius":12,"border":true,"gap":16,"padding":[16,16,16,16]}' data-settings-layout="card">
                <div className="flex items-center justify-between gap-4" data-settings-style='{"align":"between","gap":16}' data-settings-layout="row">
                    <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                            {t('options.localLibraryAutoScan') || 'Auto scan imported folders'}
                        </div>
                        <div className="text-xs opacity-50 max-w-[280px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                            {t('options.localLibraryAutoScanDesc') || 'Watch the folders you imported and run an incremental scan whenever their files change.'}
                        </div>
                    </div>
                    <button
                        onClick={() => setAutoScanEnabled(!autoScanEnabled)}
                        className={`shrink-0 w-12 h-6 rounded-full p-1 transition-colors ${!autoScanEnabled ? toggleOffBackgroundClass : ''}`}
                        style={{ backgroundColor: autoScanEnabled ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined }}
                        aria-pressed={autoScanEnabled}
                        aria-label={t('options.localLibraryAutoScan') || 'Auto scan imported folders'}
                     data-settings-style='{"width":48,"height":24,"radius":64,"padding":[4,4,4,4]}' data-settings-layout="column" data-settings-swatch={autoScanEnabled ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined}>
                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${autoScanEnabled ? 'translate-x-6' : 'translate-x-0'}`}  data-settings-style='{"width":16,"height":16,"radius":64}' data-settings-layout="column"/>
                    </button>
                </div>

                {autoScanEnabled && (
                    <div className="pt-3 border-t border-white/10 space-y-3" data-settings-style='{"gap":12,"padding":[0,12,0,0]}' data-settings-layout="column">
                        {autoScan.roots.length === 0 ? (
                            <div className="text-xs opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                                {autoScan.attaching
                                    ? (t('options.localLibraryWatchAttaching') || 'Attaching to the imported folders...')
                                    : (t('options.localLibraryWatchNoFolders') || 'No imported folders yet. Import one from the local library page.')}
                            </div>
                        ) : (
                            <div className="space-y-2" data-settings-style='{"gap":8}' data-settings-layout="column">
                                {autoScan.roots.map(root => {
                                    const detail = describeRoot(root);
                                    return (
                                        <div key={root.rootFolderName} className="bg-black/10 rounded-lg border border-white/5 px-3 py-2" data-settings-style='{"fill":true,"radius":8,"border":true,"padding":[12,8,12,8]}' data-settings-layout="card">
                                            <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"align":"center","gap":8,"font":12,"weight":500,"tone":"text"}' data-settings-layout="row">
                                                {detail.warning
                                                    ? <AlertTriangle size={12} className="shrink-0 opacity-70" />
                                                    : <Eye size={12} className="shrink-0 opacity-50" />}
                                                <span className="truncate" data-settings-layout="wrap">{root.rootFolderName}</span>
                                            </div>
                                            <div className="text-[10px] opacity-45 mt-1 break-all font-mono" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":10,"tone":"muted","margin":[0,4,0,0]}' data-settings-layout="column">
                                                {detail.text}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="flex items-center justify-between gap-3" data-settings-style='{"align":"between","gap":12}' data-settings-layout="row">
                            <div className="text-[11px] opacity-50 min-w-0" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted","grow":true}' data-settings-layout="column">
                                {autoScan.scanning
                                    ? (t('options.localLibraryWatchScanning') || 'Scanning changed files...')
                                    : lastScanLabel}
                            </div>
                            <button
                                onClick={() => { void refreshLocalLibraryAutoScanRoots(); }}
                                disabled={autoScan.attaching}
                                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ color: 'var(--text-primary)' }}
                             data-settings-style='{"align":"center","radius":8,"font":12,"weight":500,"gap":6,"fill":true,"padding":[12,6,12,6],"tone":"text"}' data-settings-layout="row">
                                {autoScan.attaching
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <RefreshCw size={12} />}
                                {t('options.localLibraryWatchRecheck') || 'Re-check folders'}
                            </button>
                        </div>

                        {autoScan.lastError && (
                            <div className={`text-[11px] break-all ${errorTextColor}`} data-settings-style='{"font":11}' data-settings-layout="column">
                                {autoScan.lastError}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </SettingsAnchor>
    );
};

export default LocalLibraryWatchSection;

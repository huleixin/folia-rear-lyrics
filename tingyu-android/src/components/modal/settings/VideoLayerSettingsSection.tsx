import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { FolderOpen, KeyRound, Trash2 } from 'lucide-react';
import type { Theme } from '../../../types';
import {
    ensureVideoLayerFileRestored,
    useVideoLayerSettingsStore,
    VIDEO_LAYER_OPACITY_BOUNDS,
    type VideoLayerFit,
} from '../../../stores/useVideoLayerSettingsStore';
import { setStatusMessage } from '../../../stores/useStatusMessageStore';
import { VideoLayerFileTooLargeError } from '../../../services/videoLayerFile';

// src/components/modal/settings/VideoLayerSettingsSection.tsx
// Settings for the built-in video layer behind the lyrics. Reads the store directly, the way
// GridViewSettingsSection does. Deliberately outside the appearance import/export payload and the
// OBS sources (see useVideoLayerSettingsStore).

type VideoLayerSettingsSectionProps = {
    settingsCardClass: string;
    settingsDividerClass: string;
    toggleOffBackgroundClass: string;
    getAccentOptionStyle: (active: boolean) => React.CSSProperties;
    theme?: Theme;
};

const FIT_OPTIONS: Array<[VideoLayerFit, string]> = [
    ['cover', 'options.videoLayerFitCover'],
    ['contain', 'options.videoLayerFitContain'],
];

const VideoLayerSettingsSection: React.FC<VideoLayerSettingsSectionProps> = ({
    settingsCardClass,
    settingsDividerClass,
    toggleOffBackgroundClass,
    getAccentOptionStyle,
    theme,
}) => {
    const { t } = useTranslation();
    const settings = useVideoLayerSettingsStore(useShallow(state => ({
        enabled: state.videoLayerEnabled,
        url: state.videoLayerUrl,
        opacity: state.videoLayerOpacity,
        fit: state.videoLayerFit,
        localFileName: state.localFileName,
        localFileStatus: state.localFileStatus,
        canPersistLocalFile: state.canPersistLocalFile,
    })));
    const actions = useVideoLayerSettingsStore(useShallow(state => ({
        setEnabled: state.setVideoLayerEnabled,
        setUrl: state.setVideoLayerUrl,
        setOpacity: state.setVideoLayerOpacity,
        setFit: state.setVideoLayerFit,
        pickLocalFile: state.pickLocalFile,
        clearLocalFile: state.clearLocalFile,
        regrantLocalFile: state.regrantLocalFile,
    })));
    // The URL commits on blur/Enter, so a half-typed address never reaches the <video>.
    const [urlDraft, setUrlDraft] = useState(settings.url);

    useEffect(() => {
        ensureVideoLayerFileRestored();
    }, []);

    useEffect(() => {
        setUrlDraft(settings.url);
    }, [settings.url]);

    const handlePick = async () => {
        try {
            await actions.pickLocalFile();
        } catch (error) {
            if (error instanceof VideoLayerFileTooLargeError) {
                setStatusMessage({ type: 'error', text: t('options.videoLayerFileTooLarge') });
                return;
            }
            console.error('[VideoLayer] Failed to pick a video:', error);
            setStatusMessage({ type: 'error', text: t('options.videoLayerPickFailed') });
        }
    };

    const hasLocalFile = settings.localFileStatus !== 'none';

    return (
        <div className={`p-4 rounded-xl border space-y-4 ${settingsCardClass}`} data-settings-style='{"radius":12,"border":true,"gap":16,"padding":[16,16,16,16]}' data-settings-layout="card">
            <div className="flex items-center justify-between gap-4" data-settings-style='{"align":"between","gap":16}' data-settings-layout="row">
                <div className="space-y-1 min-w-0" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                        {t('options.videoLayerEnabled')}
                    </div>
                    <div className="text-xs opacity-50 max-w-[400px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                        {t('options.videoLayerDesc')}
                    </div>
                </div>
                <button
                    onClick={() => actions.setEnabled(!settings.enabled)}
                    className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${!settings.enabled ? toggleOffBackgroundClass : ''}`}
                    style={{ backgroundColor: settings.enabled ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined }}
                    aria-pressed={settings.enabled}
                    aria-label={t('options.videoLayerEnabled')}
                 data-settings-style='{"width":48,"height":24,"radius":64,"padding":[4,4,4,4]}' data-settings-layout="column" data-settings-swatch={settings.enabled ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${settings.enabled ? 'translate-x-6' : 'translate-x-0'}`}  data-settings-style='{"width":16,"height":16,"radius":64}' data-settings-layout="column"/>
                </button>
            </div>

            <div className={`border-t pt-4 space-y-2 ${settingsDividerClass}`} data-settings-style='{"gap":8,"padding":[0,16,0,0]}' data-settings-layout="column">
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                    {t('options.videoLayerLocalFile')}
                </div>
                <div className="text-xs opacity-50 max-w-[400px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                    {t(settings.canPersistLocalFile ? 'options.videoLayerLocalFileDesc' : 'options.videoLayerLocalFileSessionDesc')}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1" data-settings-style='{"align":"center","gap":8,"padding":[0,4,0,0]}' data-settings-layout="wrap">
                    <button
                        type="button"
                        onClick={() => void handlePick()}
                        className="px-3 py-1.5 rounded-lg text-xs border transition-all flex items-center gap-1.5"
                        style={getAccentOptionStyle(false)}
                     data-settings-style='{"align":"center","radius":8,"font":12,"border":true,"gap":6,"padding":[12,6,12,6]}' data-settings-layout="row">
                        <FolderOpen size={12} className="opacity-70" />
                        <span data-settings-layout="wrap">{t('options.videoLayerPickFile')}</span>
                    </button>
                    {settings.localFileStatus === 'needs-permission' && (
                        <button
                            type="button"
                            onClick={() => void actions.regrantLocalFile()}
                            className="px-3 py-1.5 rounded-lg text-xs border transition-all flex items-center gap-1.5"
                            style={getAccentOptionStyle(true)}
                         data-settings-style='{"align":"center","radius":8,"font":12,"border":true,"gap":6,"padding":[12,6,12,6]}' data-settings-layout="row">
                            <KeyRound size={12} className="opacity-70" />
                            <span data-settings-layout="wrap">{t('options.videoLayerRegrant')}</span>
                        </button>
                    )}
                    {hasLocalFile && (
                        <button
                            type="button"
                            onClick={() => void actions.clearLocalFile()}
                            className="px-3 py-1.5 rounded-lg text-xs border transition-all flex items-center gap-1.5"
                            style={getAccentOptionStyle(false)}
                         data-settings-style='{"align":"center","radius":8,"font":12,"border":true,"gap":6,"padding":[12,6,12,6]}' data-settings-layout="row">
                            <Trash2 size={12} className="opacity-70" />
                            <span data-settings-layout="wrap">{t('options.videoLayerClearFile')}</span>
                        </button>
                    )}
                    {hasLocalFile && (
                        <span className="flex min-w-0 items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"align":"center","gap":4,"font":12,"tone":"muted"}' data-settings-layout="row">
                            <span className="truncate max-w-[220px]" title={settings.localFileName ?? undefined} data-settings-layout="wrap">
                                {settings.localFileName}
                            </span>
                        </span>
                    )}
                </div>
            </div>

            <div className="space-y-2" data-settings-style='{"gap":8}' data-settings-layout="column">
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                    {t('options.videoLayerUrl')}
                </div>
                <div className="text-xs opacity-50 max-w-[400px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                    {t('options.videoLayerUrlDesc')}
                </div>
                <input
                    type="url"
                    value={urlDraft}
                    placeholder="https://example.com/loop.mp4"
                    onChange={event => setUrlDraft(event.target.value)}
                    onBlur={() => actions.setUrl(urlDraft)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') actions.setUrl(urlDraft);
                    }}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs focus:outline-none focus:border-white/30 transition-colors font-mono"
                    style={{ color: 'var(--text-primary)' }}
                 data-settings-style='{"fill":true,"border":true,"radius":8,"font":12,"padding":[12,8,12,8],"tone":"text"}' data-settings-layout="column"/>
            </div>

            <div className={`border-t pt-4 space-y-4 ${settingsDividerClass}`} data-settings-style='{"gap":16,"padding":[0,16,0,0]}' data-settings-layout="column">
                <div className="space-y-2" data-settings-style='{"gap":8}' data-settings-layout="column">
                    <div className="flex items-center justify-between gap-4" data-settings-style='{"align":"between","gap":16}' data-settings-layout="row">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text","grow":true}' data-settings-layout="column">
                            {t('options.videoLayerOpacity')}
                        </div>
                        <span className="font-mono text-xs shrink-0" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":12,"tone":"text"}' data-settings-layout="wrap">
                            {Math.round(settings.opacity * 100)}%
                        </span>
                    </div>
                    <input
                        type="range"
                        min={VIDEO_LAYER_OPACITY_BOUNDS.min}
                        max={VIDEO_LAYER_OPACITY_BOUNDS.max}
                        step={0.05}
                        value={settings.opacity}
                        onChange={event => actions.setOpacity(Number(event.currentTarget.value))}
                        className="w-full accent-current"
                        style={{ accentColor: theme?.accentColor }}
                        aria-label={t('options.videoLayerOpacity')}
                     data-settings-layout="column"/>
                </div>

                <div className="space-y-2" data-settings-style='{"gap":8}' data-settings-layout="column">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                        {t('options.videoLayerFit')}
                    </div>
                    <div className="grid grid-cols-2 gap-3" data-settings-style='{"columns":2,"gap":12}' data-settings-layout="grid">
                        {FIT_OPTIONS.map(([value, labelKey]) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => actions.setFit(value)}
                                className="flex flex-col items-center gap-2 p-3 rounded-lg border transition-all"
                                style={getAccentOptionStyle(settings.fit === value)}
                             data-settings-style='{"align":"center","gap":8,"radius":8,"border":true,"padding":[12,12,12,12]}' data-settings-layout="column">
                                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":12,"weight":600,"tone":"text"}' data-settings-layout="wrap">
                                    {t(labelKey)}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="text-xs opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                {t('options.videoLayerNotInExport')}
            </div>
        </div>
    );
};

export default VideoLayerSettingsSection;

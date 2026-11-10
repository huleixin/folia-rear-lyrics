import { useLxSourceStore } from '../../../stores/useLxSourceStore';
import React, { useEffect, useState } from 'react';
import { Activity, AlertCircle, Check, Loader2, RotateCcw, Server, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NowPlayingConnectionStatus, StageSource, StageStatus, Theme } from '../../../types';
import type { NavidromeServerProfile } from '../../../types/navidrome';
import type { ObsBrowserSourceStatus } from '../../../types/obsBrowserSource';
import type { PlayerCapConnectionStatus } from '../../../types/playerCap';
import type { LyricApiStatus } from '../../../types/lyricApi';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';
import { isCapacitorAndroid } from '../../../platform/runtime';
import { getColorOsLyricsSupport } from '../../../platform/foliaColorOsLyrics';

// src/components/modal/settings/IntegrationSettingsSubview.tsx
// Retain the host prop contract; only Navidrome and Android system lyrics have visible settings.
type NavidromeTestStatus = 'idle' | 'testing' | 'success' | 'failed';
type StageActionStatus = 'idle' | 'regenerating';

export type IntegrationSettingsChrome = {
    errorBgColor: string;
    errorTextColor: string;
    getAccentOptionStyle: (selected: boolean) => React.CSSProperties;
    isElectron: boolean;
    settingsCardClass: string;
    successBgColor: string;
    successTextColor: string;
    theme?: Theme;
    toggleOffBackgroundClass: string;
};

export type IntegrationStageModel = {
    nowPlayingConnectionStatus: NowPlayingConnectionStatus;
    obsBrowserSourceStatus?: ObsBrowserSourceStatus | null;
    onCopyText: (text: string) => Promise<void>;
    onRegenerateObsBrowserSourceToken?: () => Promise<void> | void;
    onRegenerateStageToken?: () => Promise<void> | void;
    onStageSourceChange?: (source: StageSource) => Promise<void> | void;
    onToggleObsBrowserSource?: (enabled: boolean) => Promise<void> | void;
    onToggleStageMode?: (enabled: boolean) => Promise<void> | void;
    playerCapConnectionStatus?: PlayerCapConnectionStatus;
    playerCapPlayers?: string[];
    setStageActionStatus: (status: StageActionStatus) => void;
    setStageAddressCopied: (copied: boolean) => void;
    stageActionStatus: StageActionStatus;
    stageAddressCopied: boolean;
    stageSource?: StageSource | null;
    stageStatus?: StageStatus | null;
};

export type IntegrationNavidromeModel = {
    /** Docker 预置可用且当前不是预置配置：显示「恢复使用服务器预置」。 */
    navidromeCanRestorePreset: boolean;
    navidromeConfigured: boolean;
    navidromeRestoreFailed: boolean;
    navidromeRestoring: boolean;
    navidromeEnabled: boolean;
    navidromePassword: string;
    navidromeServerProfile: NavidromeServerProfile | null;
    navidromeTestStatus: NavidromeTestStatus;
    navidromeUrl: string;
    navidromeUsername: string;
    navidromeUsesPreset: boolean;
    onClearNavidrome: () => void;
    onRestoreNavidromePreset: () => Promise<void> | void;
    onToggleNavidrome: (enabled: boolean) => void;
    setNavidromePassword: (value: string) => void;
    setNavidromeUrl: (value: string) => void;
    setNavidromeUsername: (value: string) => void;
    testNavidromeConnection: () => Promise<void> | void;
};

export type IntegrationDiscordModel = {
    enabled: boolean;
    onToggle: (enabled: boolean) => Promise<void> | void;
    status?: ElectronDiscordPresenceStatus | null;
};

export type IntegrationLyricApiModel = {
    status?: LyricApiStatus | null;
    onToggle?: (enabled: boolean) => Promise<void> | void;
};

type IntegrationSettingsSubviewProps = {
    chrome: IntegrationSettingsChrome;
    discord: IntegrationDiscordModel;
    lyricApi: IntegrationLyricApiModel;
    navidrome: IntegrationNavidromeModel;
    stage: IntegrationStageModel;
};

const IntegrationSettingsSubview: React.FC<IntegrationSettingsSubviewProps> = ({chrome,navidrome}) => {
    const {errorBgColor,errorTextColor,settingsCardClass,successBgColor,successTextColor,theme,toggleOffBackgroundClass}=chrome;
    const {navidromeCanRestorePreset,navidromeConfigured,navidromeEnabled,navidromeRestoreFailed,navidromeRestoring,navidromePassword,navidromeServerProfile,navidromeTestStatus,navidromeUrl,navidromeUsername,navidromeUsesPreset,onClearNavidrome,onRestoreNavidromePreset,onToggleNavidrome,setNavidromePassword,setNavidromeUrl,setNavidromeUsername,testNavidromeConnection}=navidrome;
    const {t}=useTranslation();
    const isAndroid=isCapacitorAndroid();
    const [colorOsSupport,setColorOsSupport]=useState<{supported:boolean;colorOsMajor:number}|null>(null);
    useEffect(()=>{if(!isAndroid)return;let active=true;void getColorOsLyricsSupport().then(value=>{if(active)setColorOsSupport(value);}).catch(()=>{});return()=>{active=false};},[isAndroid]);
    const navidromeExtensionCount=navidromeServerProfile?.openSubsonicExtensions.length??0;
    const navidromeFolderCount=navidromeServerProfile?.musicFolders.length??0;
    const navidromeServerLabel=navidromeServerProfile?.serverVersion||navidromeServerProfile?.serverType||t('navidrome.serverProfileUnavailable');
    return (<>
        <button className="ty-source-entry" onClick={() => useLxSourceStore.getState().show()} data-settings-layout="row">洛雪自定义音源 · 导入 / 管理</button>
            {isAndroid && (
                <SettingsAnchor anchorId="colorOsLyrics" label={t('options.colorOsLyrics') || 'ColorOS lock-screen lyrics'} nativeLayout={{"kind":"column"}}>
                    <SettingsSectionHeading icon={Activity} label={t('options.colorOsLyrics') || 'ColorOS lock-screen lyrics'} />
                    <div className={`p-4 rounded-xl border space-y-4 ${settingsCardClass}`} data-settings-style='{"radius":12,"border":true,"gap":16,"padding":[16,16,16,16]}' data-settings-layout="card">
                        <div className="space-y-1" data-settings-style='{"gap":4}' data-settings-layout="column">
                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                {t('options.colorOsLyrics') || 'ColorOS lock-screen lyrics'}
                            </div>
                            <div className="text-[10px] opacity-40 max-w-[360px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":10,"tone":"muted"}' data-settings-layout="column">
                                {t('options.colorOsLyricsDesc') || 'Publish lyrics to the native lock-screen / AOD lyric page. Enabled only when ColorOS 16+ is detected.'}
                            </div>
                        </div>
                        {colorOsSupport && (
                            <div className="flex flex-wrap items-center gap-2" data-settings-style='{"align":"center","gap":8}' data-settings-layout="wrap">
                                <span className={`px-2 py-1 rounded-full text-[10px] ${colorOsSupport.supported ? successBgColor : errorBgColor} ${colorOsSupport.supported ? successTextColor : errorTextColor}`} data-settings-style='{"radius":64,"font":10,"padding":[8,4,8,4]}' data-settings-layout="wrap">
                                    {colorOsSupport.supported
                                        ? `${t('options.colorOsLyricsActive') || 'Active'} · ColorOS ${colorOsSupport.colorOsMajor}`
                                        : t('options.colorOsLyricsInactive') || 'Inactive'}
                                </span>
                                <span className="text-[10px] opacity-60" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":10,"tone":"muted"}' data-settings-layout="wrap">
                                    {colorOsSupport.supported
                                        ? t('options.colorOsLyricsActiveDesc') || 'Lyrics are published to the system MediaSession.'
                                        : t('options.colorOsLyricsInactiveDesc') || 'This device was not detected as ColorOS 16+, so this channel stays off.'}
                                </span>
                            </div>
                        )}
                    </div>
                </SettingsAnchor>
            )}


            <SettingsAnchor anchorId="navidrome" label={t('navidrome.settings') || 'Navidrome Settings'} nativeLayout={{"kind":"column"}}>
                <h3 className="text-sm font-bold uppercase tracking-wider opacity-50 mb-4 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"align":"center","font":14,"weight":700,"tone":"muted","gap":8,"margin":[0,0,0,16]}' data-settings-layout="row">
                    <Server size={14} /> {t('navidrome.settings') || 'Navidrome Settings'}
                    {navidromeEnabled && navidromeConfigured && (
                        <span className={`ml-2 px-2 py-0.5 ${successBgColor} ${successTextColor} text-xs rounded-full font-normal normal-case`} data-settings-style='{"font":12,"radius":64,"weight":400,"padding":[8,2,8,2],"margin":[8,0,0,0]}' data-settings-layout="wrap">
                            {t('navidrome.connectionSuccess') || 'Connected'}
                        </span>
                    )}
                </h3>
                <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-4" data-settings-style='{"fill":true,"radius":12,"border":true,"gap":16,"padding":[16,16,16,16]}' data-settings-layout="card">
                    <div className="flex items-center justify-between" data-settings-style='{"align":"between"}' data-settings-layout="row">
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text","grow":true}' data-settings-layout="wrap">
                            {t('navidrome.enable') || 'Enable Navidrome'}
                        </span>
                        <button role="switch" aria-checked={navidromeEnabled}
                            onClick={() => onToggleNavidrome(!navidromeEnabled)}
                            className={`w-12 h-6 rounded-full p-1 transition-colors ${!navidromeEnabled ? toggleOffBackgroundClass : ''}`}
                            style={{ backgroundColor: navidromeEnabled ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined }}
                         data-settings-style='{"width":48,"height":24,"radius":64,"padding":[4,4,4,4]}' data-settings-layout="column" data-settings-swatch={navidromeEnabled ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined}>
                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${navidromeEnabled ? 'translate-x-6' : 'translate-x-0'}`}  data-settings-style='{"width":16,"height":16,"radius":64}' data-settings-layout="column"/>
                        </button>
                    </div>

                    {navidromeEnabled && (
                        <>
                            <div className="space-y-2" data-settings-style='{"gap":8}' data-settings-layout="column">
                                <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="wrap">
                                    {t('navidrome.serverUrl') || 'Server URL'}
                                </label>
                                <input
                                    type="url"
                                    value={navidromeUrl}
                                    onChange={(e) => setNavidromeUrl(e.target.value)}
                                    placeholder={t('navidrome.serverUrlPlaceholder') || 'e.g., http://localhost:4533'}
                                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-white/30 transition-colors"
                                    style={{ color: 'var(--text-primary)' }}
                                 data-settings-style='{"fill":true,"border":true,"radius":8,"font":14,"padding":[12,8,12,8],"tone":"text"}' data-settings-layout="column"/>
                            </div>

                            <div className="space-y-2" data-settings-style='{"gap":8}' data-settings-layout="column">
                                <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="wrap">
                                    {t('navidrome.username') || 'Username'}
                                </label>
                                <input
                                    type="text"
                                    value={navidromeUsername}
                                    onChange={(e) => setNavidromeUsername(e.target.value)}
                                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-white/30 transition-colors"
                                    style={{ color: 'var(--text-primary)' }}
                                 data-settings-style='{"fill":true,"border":true,"radius":8,"font":14,"padding":[12,8,12,8],"tone":"text"}' data-settings-layout="column"/>
                            </div>

                            <div className="space-y-2" data-settings-style='{"gap":8}' data-settings-layout="column">
                                <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="wrap">
                                    {t('navidrome.password') || 'Password'}
                                </label>
                                <input
                                    type="password"
                                    value={navidromePassword}
                                    onChange={(e) => setNavidromePassword(e.target.value)}
                                    placeholder={navidromeConfigured ? '••••••••' : ''}
                                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-white/30 transition-colors"
                                    style={{ color: 'var(--text-primary)' }}
                                 data-settings-style='{"fill":true,"border":true,"radius":8,"font":14,"padding":[12,8,12,8],"tone":"text"}' data-settings-layout="column"/>
                            </div>

                            {navidromeConfigured && navidromeServerProfile && (
                                <div className="border-t border-white/10 pt-3" data-settings-style='{"padding":[0,12,0,0]}' data-settings-layout="column">
                                    <div className="flex items-center justify-center text-xs opacity-80 overflow-hidden whitespace-nowrap" style={{ color: 'var(--text-primary)' }} data-settings-style='{"align":"center","center":true,"font":12,"tone":"text"}' data-settings-layout="row">
                                        <span className="truncate" title={navidromeServerLabel} data-settings-layout="wrap">{navidromeServerLabel}</span>
                                        <span className="opacity-50 mx-1.5 shrink-0" data-settings-style='{"tone":"muted","margin":[6,0,6,0]}' data-settings-layout="wrap">·</span>
                                        <span className="truncate" title={navidromeServerProfile.user?.username || navidromeUsername} data-settings-layout="wrap">
                                            {navidromeServerProfile.user?.username || navidromeUsername}
                                        </span>
                                        {navidromeServerProfile.openSubsonic && (
                                            <>
                                                <span className="opacity-50 mx-1.5 shrink-0" data-settings-style='{"tone":"muted","margin":[6,0,6,0]}' data-settings-layout="wrap">·</span>
                                                <span className="shrink-0" data-settings-layout="wrap">OpenSubsonic ({navidromeExtensionCount})</span>
                                            </>
                                        )}
                                        <span className="opacity-50 mx-1.5 shrink-0" data-settings-style='{"tone":"muted","margin":[6,0,6,0]}' data-settings-layout="wrap">·</span>
                                        <span className="shrink-0" data-settings-layout="wrap">{t('navidrome.musicFolders') || 'Libraries'} ({navidromeFolderCount})</span>
                                    </div>
                                </div>
                            )}

                            {navidromeConfigured && navidromeUsesPreset && (
                                <p className="text-xs opacity-60" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="wrap">
                                    {t('navidrome.usingServerPreset') || 'Using the server preset account'}
                                </p>
                            )}
                        </>
                    )}

                    {navidromeEnabled && (
                        <div className="flex gap-2 pt-2" data-settings-style='{"gap":8,"padding":[0,8,0,0]}' data-settings-layout="row">
                            <button
                                onClick={testNavidromeConnection}
                                disabled={navidromeTestStatus === 'testing' || !navidromeUrl || !navidromeUsername || !navidromePassword}
                                className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ color: 'var(--text-primary)' }}
                             data-settings-style='{"align":"center","center":true,"grow":true,"radius":8,"font":14,"weight":500,"gap":8,"fill":true,"padding":[0,10,0,10],"tone":"text"}' data-settings-layout="row">
                                {navidromeTestStatus === 'testing' ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        {t('navidrome.testing') || 'Connecting...'}
                                    </>
                                ) : navidromeTestStatus === 'success' ? (
                                    <>
                                        <Check size={16} className={successTextColor} />
                                        {t('navidrome.connectionSuccess') || 'Connected'}
                                    </>
                                ) : navidromeTestStatus === 'failed' ? (
                                    <>
                                        <AlertCircle size={16} className={errorTextColor} />
                                        {t('navidrome.connectionFailed') || 'Failed'}
                                    </>
                                ) : (
                                    <>
                                        <Server size={16} />
                                        {t('navidrome.testConnection') || 'Test Connection'}
                                    </>
                                )}
                            </button>

                            {navidromeCanRestorePreset && (
                                <button
                                    onClick={() => void onRestoreNavidromePreset()}
                                    disabled={navidromeRestoring}
                                    title={t('navidrome.restoreServerPreset') || 'Use server preset'}
                                    aria-label={t('navidrome.restoreServerPreset') || 'Use server preset'}
                                    className="px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{ color: 'var(--text-primary)' }}
                                 data-settings-style='{"align":"center","center":true,"radius":8,"font":14,"weight":500,"gap":8,"fill":true,"padding":[16,10,16,10],"tone":"text"}' data-settings-layout="row">
                                    {navidromeRestoring ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                                </button>
                            )}

                            {navidromeConfigured && (
                                <button
                                    onClick={onClearNavidrome}
                                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${errorBgColor} hover:bg-red-500/20 ${errorTextColor}`}
                                 data-settings-style='{"align":"center","center":true,"radius":8,"font":14,"weight":500,"gap":8,"padding":[16,10,16,10]}' data-settings-layout="row">
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    )}

                    {navidromeEnabled && navidromeCanRestorePreset && navidromeRestoreFailed && (
                        <p className={`text-xs ${errorTextColor}`} data-settings-style='{"font":12}' data-settings-layout="wrap">
                            {t('navidrome.restoreServerPresetFailed') || 'Could not reach the server preset. Try again later.'}
                        </p>
                    )}
                </div>
            </SettingsAnchor>
    </>);
};
export default IntegrationSettingsSubview;

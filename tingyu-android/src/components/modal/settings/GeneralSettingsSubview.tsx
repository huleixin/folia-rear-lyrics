import { isAndroidNativeRuntime } from '../../../utils/platform';
import React from 'react';
import { Languages, LayoutList, Move } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { Theme } from '../../../types';
import type { AppLanguagePreference } from '../../../i18n/config';
import { CustomSelect } from '../../shared/CustomSelect';
import PinnedCommandSettings from './PinnedCommandSettings';
import PlaybackEntryViewSection from './PlaybackEntryViewSection';
import LibrarySuiteSection from './LibrarySuiteSection';
import BravaisSettingsSection from './BravaisSettingsSection';
import PlayerBottomBarSection from './PlayerBottomBarSection';
import AdaptiveLayoutSetting from './AdaptiveLayoutSetting';
import AndroidRearLyricsSetting from './AndroidRearLyricsSetting';
import AndroidImmersiveSetting from './AndroidImmersiveSetting';
import AndroidKeepScreenOnSetting from './AndroidKeepScreenOnSetting';
import AndroidPhoneFitSetting from './AndroidPhoneFitSetting';
import CommandPaletteButtonSetting from './CommandPaletteButtonSetting';
import HomeCardPositionSection from './HomeCardPositionSection';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';
import { settingsDividerClassFor } from './settingsCardClasses';
import { useHomeLayoutSettingsStore } from '../../../stores/useHomeLayoutSettingsStore';
import { useSettingsModalStore } from '../../../stores/useSettingsModalStore';

// src/components/modal/settings/GeneralSettingsSubview.tsx
// Global app preferences that should stay independent from playback and desktop-only settings.

type GeneralSettingsSubviewProps = {
    isDaylight: boolean;
    settingsCardClass: string;
    theme?: Theme;
    utilityGhostButtonClass: string;
};

const GeneralSettingsSubview: React.FC<GeneralSettingsSubviewProps> = ({
    isDaylight,
    settingsCardClass,
    theme,
    utilityGhostButtonClass,
}) => {
    const { t, i18n } = useTranslation();
    const {
        appLanguagePreference,
        onAppLanguagePreferenceChange,
    } = useSettingsModalStore(useShallow(state => ({
        appLanguagePreference: state.appLanguagePreference,
        onAppLanguagePreferenceChange: state.handleSetAppLanguagePreference,
    })));
    const {
        showHomeTabPlaylist,
        showHomeTabRadio,
        showHomeTabAlbums,
        showHomeTabLocal,
        handleToggleHomeTabPlaylist,
        handleToggleHomeTabRadio,
        handleToggleHomeTabAlbums,
        handleToggleHomeTabLocal,
    } = useHomeLayoutSettingsStore(useShallow(state => ({
        showHomeTabPlaylist: state.showHomeTabPlaylist,
        showHomeTabRadio: state.showHomeTabRadio,
        showHomeTabAlbums: state.showHomeTabAlbums,
        showHomeTabLocal: state.showHomeTabLocal,
        handleToggleHomeTabPlaylist: state.handleToggleHomeTabPlaylist,
        handleToggleHomeTabRadio: state.handleToggleHomeTabRadio,
        handleToggleHomeTabAlbums: state.handleToggleHomeTabAlbums,
        handleToggleHomeTabLocal: state.handleToggleHomeTabLocal,
    })));
    const getResolvedLanguageLabel = (): string => {
        const lang = i18n.resolvedLanguage;
        if (lang?.startsWith('zh')) {
            return t('options.appLanguageZhCN');
        }
        if (lang === 'in' || lang?.startsWith('id')) {
            return t('options.appLanguageInID') || 'Bahasa Indonesia';
        }
        return t('options.appLanguageEnUS') || 'English';
    };

    const currentResolvedLanguage = getResolvedLanguageLabel();

    const languageOptions: Array<{ value: AppLanguagePreference; label: string; }> = [
        { value: 'system', label: t('options.appLanguageSystem') },
        { value: 'zh-CN', label: t('options.appLanguageZhCN') },
        { value: 'en', label: t('options.appLanguageEnUS') || 'English' },
        { value: 'in', label: t('options.appLanguageInID') || 'Bahasa Indonesia' },
    ];

    const languageHint = appLanguagePreference === 'system'
        ? (t('options.appLanguageSystemHint')).replace('{{language}}', currentResolvedLanguage)
        : null;

    const toggleOffBackgroundClass = isDaylight ? 'bg-zinc-200' : 'bg-[#2A2D35]';
    const rangeInputClass = [
        'w-full accent-current',
        isDaylight ? 'text-zinc-900' : 'text-white',
    ].join(' ');

    return (
        <div className="space-y-5" data-settings-style='{"gap":20}' data-settings-layout="column">
            <SettingsAnchor anchorId="languageSettings" label={t('options.languageSettings')} nativeLayout={{"kind":"column"}}>
                <SettingsSectionHeading icon={Languages} label={t('options.languageSettings')} />
                <div className={`p-4 rounded-xl border space-y-4 ${settingsCardClass}`} data-settings-style='{"radius":12,"border":true,"gap":16,"padding":[16,16,16,16]}' data-settings-layout="card">
                    <div className="space-y-1" data-settings-style='{"gap":4}' data-settings-layout="column">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                            {t('options.appLanguage')}
                        </div>
                        <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                            {t('options.appLanguageDesc')}
                        </div>
                    </div>
                    <CustomSelect
                        value={appLanguagePreference}
                        onChange={(value) => {
                            void onAppLanguagePreferenceChange(value as AppLanguagePreference);
                        }}
                        options={languageOptions}
                        ariaLabel={t('options.appLanguage')}
                        isDaylight={isDaylight}
                        theme={theme}
                        nativeSelect
                    />
                    {languageHint && (
                        <div className="text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                            {languageHint}
                        </div>
                    )}
                </div>
            </SettingsAnchor>

            <SettingsAnchor anchorId="homeTabsVisibility" label={t(isAndroidNativeRuntime() ? 'mobileSettings.libraryCategories' : 'options.homeTabsVisibility')} nativeLayout={{"kind":"column"}}>
                <SettingsSectionHeading icon={LayoutList} label={t(isAndroidNativeRuntime() ? 'mobileSettings.libraryCategories' : 'options.homeTabsVisibility')} />
                <div className={`rounded-xl border ${settingsCardClass} overflow-hidden`} data-settings-style='{"radius":12,"border":true}' data-settings-layout="card">
                    <div className={`flex items-center justify-between p-4 border-b ${settingsDividerClassFor(isDaylight)}`} data-settings-style='{"align":"between","divider":true,"padding":[16,16,16,16]}' data-settings-layout="row">
                        <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                {t('options.showHomeTabPlaylist')}
                            </div>
                        </div>
                        <button role="switch" aria-checked={showHomeTabPlaylist}
                            onClick={() => handleToggleHomeTabPlaylist(!showHomeTabPlaylist)}
                            className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${!showHomeTabPlaylist ? toggleOffBackgroundClass : ''}`}
                            style={{ backgroundColor: showHomeTabPlaylist ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined }}
                         data-settings-style='{"width":48,"height":24,"radius":64,"padding":[4,4,4,4]}' data-settings-layout="column" data-settings-swatch={showHomeTabPlaylist ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined}>
                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${showHomeTabPlaylist ? 'translate-x-6' : 'translate-x-0'}`}  data-settings-style='{"width":16,"height":16,"radius":64}' data-settings-layout="column"/>
                        </button>
                    </div>

                    <div className={`flex items-center justify-between p-4 border-b ${settingsDividerClassFor(isDaylight)}`} data-settings-style='{"align":"between","divider":true,"padding":[16,16,16,16]}' data-settings-layout="row">
                        <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                {t('options.showHomeTabRadio')}
                            </div>
                        </div>
                        <button role="switch" aria-checked={showHomeTabRadio}
                            onClick={() => handleToggleHomeTabRadio(!showHomeTabRadio)}
                            className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${!showHomeTabRadio ? toggleOffBackgroundClass : ''}`}
                            style={{ backgroundColor: showHomeTabRadio ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined }}
                         data-settings-style='{"width":48,"height":24,"radius":64,"padding":[4,4,4,4]}' data-settings-layout="column" data-settings-swatch={showHomeTabRadio ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined}>
                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${showHomeTabRadio ? 'translate-x-6' : 'translate-x-0'}`}  data-settings-style='{"width":16,"height":16,"radius":64}' data-settings-layout="column"/>
                        </button>
                    </div>

                    <div className={`flex items-center justify-between p-4 border-b ${settingsDividerClassFor(isDaylight)}`} data-settings-style='{"align":"between","divider":true,"padding":[16,16,16,16]}' data-settings-layout="row">
                        <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                {t('options.showHomeTabAlbums')}
                            </div>
                        </div>
                        <button role="switch" aria-checked={showHomeTabAlbums}
                            onClick={() => handleToggleHomeTabAlbums(!showHomeTabAlbums)}
                            className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${!showHomeTabAlbums ? toggleOffBackgroundClass : ''}`}
                            style={{ backgroundColor: showHomeTabAlbums ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined }}
                         data-settings-style='{"width":48,"height":24,"radius":64,"padding":[4,4,4,4]}' data-settings-layout="column" data-settings-swatch={showHomeTabAlbums ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined}>
                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${showHomeTabAlbums ? 'translate-x-6' : 'translate-x-0'}`}  data-settings-style='{"width":16,"height":16,"radius":64}' data-settings-layout="column"/>
                        </button>
                    </div>

                    <div className="flex items-center justify-between p-4" data-settings-style='{"align":"between","padding":[16,16,16,16]}' data-settings-layout="row">
                        <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                {t('options.showHomeTabLocal')}
                            </div>
                        </div>
                        <button role="switch" aria-checked={showHomeTabLocal}
                            onClick={() => handleToggleHomeTabLocal(!showHomeTabLocal)}
                            className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${!showHomeTabLocal ? toggleOffBackgroundClass : ''}`}
                            style={{ backgroundColor: showHomeTabLocal ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined }}
                         data-settings-style='{"width":48,"height":24,"radius":64,"padding":[4,4,4,4]}' data-settings-layout="column" data-settings-swatch={showHomeTabLocal ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined}>
                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${showHomeTabLocal ? 'translate-x-6' : 'translate-x-0'}`}  data-settings-style='{"width":16,"height":16,"radius":64}' data-settings-layout="column"/>
                        </button>
                    </div>
                </div>
            </SettingsAnchor>

            {!isAndroidNativeRuntime() && <HomeCardPositionSection isDaylight={isDaylight} settingsCardClass={settingsCardClass} theme={theme} />}

            <PlaybackEntryViewSection
                isDaylight={isDaylight}
                settingsCardClass={settingsCardClass}
                theme={theme}
            />

            <LibrarySuiteSection
                isDaylight={isDaylight}
                settingsCardClass={settingsCardClass}
                theme={theme}
            />

            <BravaisSettingsSection
                isDaylight={isDaylight}
                settingsCardClass={settingsCardClass}
                theme={theme}
            />

            {!isAndroidNativeRuntime() && <SettingsAnchor anchorId="bottomUiSettings" label={t('options.bottomUiSettings')} className="space-y-4" nativeLayout={{"kind":"column","gap":16}}>
                <SettingsSectionHeading icon={Move} label={t('options.bottomUiSettings')} />
                <PlayerBottomBarSection
                    settingsCardClass={settingsCardClass}
                    utilityGhostButtonClass={utilityGhostButtonClass}
                    rangeInputClass={rangeInputClass}
                    isDaylight={isDaylight}
                    theme={theme}
                />
            </SettingsAnchor>}

            {!isAndroidNativeRuntime() && <PinnedCommandSettings
                isDaylight={isDaylight}
                settingsCardClass={settingsCardClass}
                theme={theme}
            />}

            {!isAndroidNativeRuntime() && <AdaptiveLayoutSetting
                isDaylight={isDaylight}
                settingsCardClass={settingsCardClass}
                theme={theme}
            />}

            {!isAndroidNativeRuntime() && <AndroidRearLyricsSetting
                isDaylight={isDaylight}
                settingsCardClass={settingsCardClass}
                theme={theme}
            />}

            {!isAndroidNativeRuntime() && <AndroidImmersiveSetting
                isDaylight={isDaylight}
                settingsCardClass={settingsCardClass}
                theme={theme}
            />}

            <AndroidKeepScreenOnSetting
                isDaylight={isDaylight}
                settingsCardClass={settingsCardClass}
                theme={theme}
            />

            <AndroidPhoneFitSetting
                isDaylight={isDaylight}
                settingsCardClass={settingsCardClass}
                theme={theme}
            />

            {!isAndroidNativeRuntime() && <CommandPaletteButtonSetting
                isDaylight={isDaylight}
                settingsCardClass={settingsCardClass}
                theme={theme}
            />}

        </div>
    );
};

export default GeneralSettingsSubview;

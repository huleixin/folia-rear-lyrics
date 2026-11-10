import React from 'react';
import { Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';
import { useAndroidLayoutSettingsStore } from '../../../stores/useAndroidLayoutSettingsStore';

// Android-only compact layout switch. It deliberately lives next to, but separate from, the
// native fullscreen switch so upstream layout breakpoints remain untouched when it is off.

type AndroidPhoneFitSettingProps = {
    isDaylight: boolean;
    settingsCardClass: string;
    theme?: { secondaryColor?: string } | null;
};

const isAndroidNativeRuntime = (): boolean => (
    typeof window !== 'undefined'
    && (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() === 'android'
);

const AndroidPhoneFitSetting: React.FC<AndroidPhoneFitSettingProps> = ({
    isDaylight,
    settingsCardClass,
    theme,
}) => {
    const { t } = useTranslation();
    const enabled = useAndroidLayoutSettingsStore(state => state.phoneFitEnabled);
    const orientation = useAndroidLayoutSettingsStore(state => state.phoneFitOrientation);
    const setEnabled = useAndroidLayoutSettingsStore(state => state.setPhoneFitEnabled);
    const setOrientation = useAndroidLayoutSettingsStore(state => state.setPhoneFitOrientation);

    if (!isAndroidNativeRuntime()) return null;

    const toggleOffBackgroundClass = isDaylight ? 'bg-zinc-200' : 'bg-[#2A2D35]';

    return (
        <div className="space-y-4" data-settings-style='{"gap":16}' data-settings-layout="column">
            <SettingsSectionHeading icon={Smartphone} label={t('options.phoneFit')} />
            <div className={`p-4 rounded-xl border ${settingsCardClass}`} data-settings-style='{"radius":12,"border":true,"padding":[16,16,16,16]}' data-settings-layout="card">
                <div className="flex items-center justify-between gap-4" data-settings-style='{"align":"between","gap":16}' data-settings-layout="row">
                    <div className="space-y-1 min-w-0" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                            {t('options.phoneFit')}
                        </div>
                        <div className="text-xs opacity-50 leading-relaxed" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                            {t('mobileSettings.phoneFitDescription')}
                        </div>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label={t('options.phoneFit')}
                        onClick={() => setEnabled(!enabled)}
                        className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${!enabled ? toggleOffBackgroundClass : ''}`}
                        style={{ backgroundColor: enabled ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined }}
                     data-settings-style='{"width":48,"height":24,"radius":64,"padding":[4,4,4,4]}' data-settings-layout="column" data-settings-swatch={enabled ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined}>
                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0'}`}  data-settings-style='{"width":16,"height":16,"radius":64}' data-settings-layout="column"/>
                    </button>
                </div>

                {enabled && (
                    <div className={`mt-4 pt-4 border-t flex items-center justify-between gap-4 ${isDaylight ? 'border-black/5' : 'border-white/10'}`} data-settings-style='{"align":"between","gap":16,"padding":[0,16,0,0],"margin":[0,16,0,0]}' data-settings-layout="row">
                        <div className="space-y-1 min-w-0" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                {t('options.orientationFit')}
                            </div>
                            <div className="text-xs opacity-50 leading-relaxed" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                                {t('options.orientationFitDesc')}
                            </div>
                            <div className="text-[11px] font-semibold opacity-70" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"weight":600,"tone":"muted"}' data-settings-layout="column">
                                {orientation === 'landscape' ? t('options.orientationLandscape') : t('options.orientationPortrait')}
                            </div>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={orientation === 'landscape'}
                            aria-label={t('options.orientationFit')}
                            onClick={() => setOrientation(orientation === 'landscape' ? 'portrait' : 'landscape')}
                            className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${orientation !== 'landscape' ? toggleOffBackgroundClass : ''}`}
                            style={{ backgroundColor: orientation === 'landscape' ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined }}
                         data-settings-style='{"width":48,"height":24,"radius":64,"padding":[4,4,4,4]}' data-settings-layout="column" data-settings-swatch={orientation === 'landscape' ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined}>
                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${orientation === 'landscape' ? 'translate-x-6' : 'translate-x-0'}`}  data-settings-style='{"width":16,"height":16,"radius":64}' data-settings-layout="column"/>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AndroidPhoneFitSetting;

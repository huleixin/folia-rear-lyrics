import React from 'react';
import { EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';
import { useAndroidLayoutSettingsStore } from '../../../stores/useAndroidLayoutSettingsStore';
import { isAndroidNativeRuntime } from '../../../utils/platform';

// src/components/modal/settings/AndroidImmersiveSetting.tsx
// Android 播放页自动隐藏：复用原有持久化偏好，在视觉设置中调整。

type AndroidImmersiveSettingProps = {
    isDaylight: boolean;
    settingsCardClass: string;
    theme?: { secondaryColor?: string } | null;
    compact?: boolean;
};

const AndroidImmersiveSetting: React.FC<AndroidImmersiveSettingProps> = ({
    isDaylight,
    settingsCardClass,
    theme,
    compact = false,
}) => {
    const { t } = useTranslation();
    const label = t(compact ? 'mobileSettings.immersiveTitle' : 'options.immersiveMode');
    const enabled = useAndroidLayoutSettingsStore(state => state.immersiveModeEnabled);
    const setEnabled = useAndroidLayoutSettingsStore(state => state.setImmersiveModeEnabled);

    if (!isAndroidNativeRuntime()) return null;

    const toggleOffBackgroundClass = isDaylight ? 'bg-zinc-200' : 'bg-[#2A2D35]';

    return (
        <div className={compact ? 'ty-settings-feature' : 'space-y-4'} data-settings-style='{"gap":16,"margin":[0,0,0,16]}' data-settings-layout="column">
            {compact ? <h2 className="ty-settings-group-title" data-settings-style='{"gap":10,"font":13,"weight":500,"tone":"muted","margin":[2,0,2,8]}' data-settings-layout="row"><EyeOff size={16} />{label}</h2>
                : <SettingsSectionHeading icon={EyeOff} label={label} />}
            <div className={compact ? 'ty-settings-card ty-immersive-card' : `p-4 rounded-xl border ${settingsCardClass}`} data-settings-style='{"radius":14,"border":true,"padding":[16,16,16,16]}' data-settings-layout="card">
                <div className="flex items-center justify-between gap-4" data-settings-style='{"align":"between","gap":16}' data-settings-layout="row">
                    <div className="space-y-1 min-w-0" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                        <div className={compact ? 'ty-settings-feature-title' : 'text-sm font-medium'} style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":15,"weight":600,"tone":"text"}' data-settings-layout="column">
                            {label}
                        </div>
                        <div className={compact ? 'ty-settings-description' : 'text-xs opacity-50 leading-relaxed'} style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted","margin":[0,4,0,0]}' data-settings-layout="column">
                            {t(compact ? 'mobileSettings.immersiveDescription' : 'options.immersiveModeDesc')}
                        </div>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label={label}
                        onClick={() => setEnabled(!enabled)}
                        className={compact ? 'ty-settings-switch' : `w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${!enabled ? toggleOffBackgroundClass : ''}`}
                        style={!compact ? { backgroundColor: enabled ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined } : undefined}
                     data-settings-style='{"width":48,"height":24,"radius":64,"padding":[4,4,4,4]}' data-settings-layout="column">
                        <div className={compact ? 'ty-settings-switch-thumb' : `w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0'}`}  data-settings-style='{"width":16,"height":16,"radius":64}' data-settings-layout="column"/>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AndroidImmersiveSetting;

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
        <div className={compact ? 'ty-settings-feature' : 'space-y-4'}>
            {compact ? <h2 className="ty-settings-group-title"><EyeOff size={16} />{label}</h2>
                : <SettingsSectionHeading icon={EyeOff} label={label} />}
            <div className={compact ? 'ty-settings-card ty-immersive-card' : `p-4 rounded-xl border ${settingsCardClass}`}>
                <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                        <div className={compact ? 'ty-settings-feature-title' : 'text-sm font-medium'} style={{ color: 'var(--text-primary)' }}>
                            {label}
                        </div>
                        <div className={compact ? 'ty-settings-description' : 'text-xs opacity-50 leading-relaxed'} style={{ color: 'var(--text-secondary)' }}>
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
                    >
                        <div className={compact ? 'ty-settings-switch-thumb' : `w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AndroidImmersiveSetting;

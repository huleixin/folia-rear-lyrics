import React from 'react';
import { Command } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerChromeSettingsStore } from '../../../stores/usePlayerChromeSettingsStore';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';

// src/components/modal/settings/CommandPaletteButtonSetting.tsx
// 底部命令面板按钮的自动隐藏开关。桌面版有 Ctrl+K、不渲染这个按钮，所以只在非桌面显示。

type CommandPaletteButtonSettingProps = {
    isDaylight: boolean;
    settingsCardClass: string;
    theme?: { secondaryColor?: string } | null;
};

const isElectronBuild = (): boolean => (
    typeof window !== 'undefined' && Boolean((window as unknown as { electron?: unknown }).electron)
);

const CommandPaletteButtonSetting: React.FC<CommandPaletteButtonSettingProps> = ({
    isDaylight,
    settingsCardClass,
    theme,
}) => {
    const { t } = useTranslation();
    const { autoHide, onToggle } = usePlayerChromeSettingsStore(useShallow(state => ({
        autoHide: state.autoHideCommandPaletteButton,
        onToggle: state.handleToggleAutoHideCommandPaletteButton,
    })));

    if (isElectronBuild()) return null;

    const toggleOffBackgroundClass = isDaylight ? 'bg-zinc-200' : 'bg-[#2A2D35]';

    return (
        <div className="space-y-4" data-settings-style='{"gap":16}' data-settings-layout="column">
            <SettingsSectionHeading icon={Command} label={t('options.commandPaletteButtonSection')} />
            <div className={`p-4 rounded-xl border ${settingsCardClass}`} data-settings-style='{"radius":12,"border":true,"padding":[16,16,16,16]}' data-settings-layout="card">
                <div className="flex items-center justify-between gap-4" data-settings-style='{"align":"between","gap":16}' data-settings-layout="row">
                    <div className="space-y-1 min-w-0" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                            {t('options.commandPaletteButtonAutoHide')}
                        </div>
                        <div className="text-xs opacity-50 leading-relaxed" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                            {t('options.commandPaletteButtonAutoHideDesc')}
                        </div>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={autoHide}
                        aria-label={t('options.commandPaletteButtonAutoHide')}
                        onClick={() => onToggle(!autoHide)}
                        className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${!autoHide ? toggleOffBackgroundClass : ''}`}
                        style={{ backgroundColor: autoHide ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined }}
                     data-settings-style='{"width":48,"height":24,"radius":64,"padding":[4,4,4,4]}' data-settings-layout="column" data-settings-swatch={autoHide ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined}>
                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${autoHide ? 'translate-x-6' : 'translate-x-0'}`}  data-settings-style='{"width":16,"height":16,"radius":64}' data-settings-layout="column"/>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CommandPaletteButtonSetting;

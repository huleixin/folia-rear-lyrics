import React from 'react';
import { Bookmark } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../../../types';
import { useHomeLayoutSettingsStore } from '../../../stores/useHomeLayoutSettingsStore';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';

// src/components/modal/settings/HomeCardPositionSection.tsx
// Controls session-local card restoration for the home screen's independent sections.

type Props = { isDaylight: boolean; settingsCardClass: string; theme?: Theme };

const HomeCardPositionSection: React.FC<Props> = ({ isDaylight, settingsCardClass, theme }) => {
    const { t } = useTranslation();
    const enabled = useHomeLayoutSettingsStore(state => state.rememberHomeCardPosition);
    const toggle = useHomeLayoutSettingsStore(state => state.handleToggleRememberHomeCardPosition);

    return (
        <SettingsAnchor anchorId="rememberHomeCardPosition" label={t('options.rememberHomeCardPosition')} nativeLayout={{"kind":"column"}}>
            <SettingsSectionHeading icon={Bookmark} label={t('options.rememberHomeCardPosition')} />
            <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${settingsCardClass}`} data-settings-style='{"align":"between","radius":12,"border":true,"gap":16,"padding":[16,16,16,16],"fill":true}' data-settings-layout="row">
                <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                    {t('options.rememberHomeCardPositionDesc')}
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={t('options.rememberHomeCardPosition')}
                    onClick={() => toggle(!enabled)}
                    className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${enabled ? '' : isDaylight ? 'bg-zinc-200' : 'bg-[#2A2D35]'}`}
                    style={{ backgroundColor: enabled ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined }}
                 data-settings-style='{"width":48,"height":24,"radius":64,"padding":[4,4,4,4]}' data-settings-layout="column" data-settings-swatch={enabled ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0'}`}  data-settings-style='{"width":16,"height":16,"radius":64}' data-settings-layout="column"/>
                </button>
            </div>
        </SettingsAnchor>
    );
};

export default HomeCardPositionSection;

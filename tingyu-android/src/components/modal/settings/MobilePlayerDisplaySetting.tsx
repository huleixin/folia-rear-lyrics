import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../../../types';
import { isAndroidNativeRuntime } from '../../../utils/platform';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';
import SettingsRow, { SettingsToggle } from './SettingsRow';
import { Captions } from 'lucide-react';
import { useTypographySettingsStore } from '../../../stores/useTypographySettingsStore';

// src/components/modal/settings/MobilePlayerDisplaySetting.tsx
// Keep the effective front-stage subtitle preference in visual settings, separate from obsolete chrome controls.
export default function MobilePlayerDisplaySetting({ isDaylight, settingsCardClass, theme }: {
    isDaylight: boolean; settingsCardClass: string; theme?: Theme;
}) {
    const { t } = useTranslation();
    const hidden = useTypographySettingsStore(state => state.hidePlayerTranslationSubtitle);
    const toggle = useTypographySettingsStore(state => state.handleToggleHidePlayerTranslationSubtitle);
    if (!isAndroidNativeRuntime()) return null;
    return <SettingsAnchor anchorId="mobilePlayerDisplay" label={t('mobileSettings.playerDisplay')}>
        <SettingsSectionHeading icon={Captions} label={t('mobileSettings.playerDisplay')} />
        <div className={`rounded-xl border ${settingsCardClass}`}>
            <SettingsRow title={t('options.hidePlayerTranslationSubtitle')} description={t('mobileSettings.subtitleDescription')} isLast dividerClass=""
                control={<SettingsToggle checked={hidden} onChange={() => toggle(!hidden)}
                    ariaLabel={t('options.hidePlayerTranslationSubtitle')} offClass={isDaylight ? 'bg-zinc-200' : 'bg-[#2A2D35]'} onColor={theme?.secondaryColor} />} />
        </div>
    </SettingsAnchor>;
}

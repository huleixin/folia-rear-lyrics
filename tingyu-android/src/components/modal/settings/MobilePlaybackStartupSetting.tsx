import React from 'react';
import PlaybackEngineTestSettings from './PlaybackEngineTestSettings';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../../../types';
import { isAndroidNativeRuntime } from '../../../utils/platform';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';
import SettingsRow, { SettingsToggle } from './SettingsRow';
import { PlayCircle } from 'lucide-react';
import { useAudioSettingsStore } from '../../../stores/useAudioSettingsStore';

// src/components/modal/settings/MobilePlaybackStartupSetting.tsx
// Relocates the working launch preference; storage and session restoration stay with their existing owners.
export default function MobilePlaybackStartupSetting({ isDaylight, settingsCardClass, theme }: {
    isDaylight: boolean; settingsCardClass: string; theme?: Theme;
}) {
    const { t } = useTranslation();
    const enabled = useAudioSettingsStore(state => state.autoPlayOnLaunch);
    const toggle = useAudioSettingsStore(state => state.handleToggleAutoPlayOnLaunch);
    if (!isAndroidNativeRuntime()) return null;
    return <SettingsAnchor anchorId="playbackStartup" label={t('mobileSettings.playbackStartup')}>
        <SettingsSectionHeading icon={PlayCircle} label={t('mobileSettings.playbackStartup')} />
        <div className={`rounded-xl border ${settingsCardClass}`}>
            <SettingsRow title={t('options.autoPlayOnLaunch')} description={t('mobileSettings.autoPlayDescription')} isLast dividerClass=""
                control={<SettingsToggle checked={enabled} onChange={() => toggle(!enabled)}
                    ariaLabel={t('options.autoPlayOnLaunch')} offClass={isDaylight ? 'bg-zinc-200' : 'bg-[#2A2D35]'} onColor={theme?.secondaryColor} />} />
        </div>
        <PlaybackEngineTestSettings settingsCardClass={settingsCardClass} />
    </SettingsAnchor>;
}

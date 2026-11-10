import { isAndroidNativeRuntime } from '../../../utils/platform';
import React from 'react';
import { MonitorPlay } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { Theme } from '../../../types';
import { PlaybackEntryViewOptions } from '../playback-entry-view/PlaybackEntryViewOptions';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';
import { usePlaybackEntryViewStore } from '../../../stores/usePlaybackEntryViewStore';

// src/components/modal/settings/PlaybackEntryViewSection.tsx
// Where pressing play lands. Same two cards the first-run prompt shows, mounted in 界面设置.

type PlaybackEntryViewSectionProps = {
    isDaylight: boolean;
    settingsCardClass: string;
    theme?: Theme;
};

const PlaybackEntryViewSection: React.FC<PlaybackEntryViewSectionProps> = ({
    isDaylight,
    settingsCardClass,
    theme,
}) => {
    const { t } = useTranslation();
    const { playbackEntryView, setPlaybackEntryView } = usePlaybackEntryViewStore(useShallow(state => ({
        playbackEntryView: state.playbackEntryView,
        setPlaybackEntryView: state.setPlaybackEntryView,
    })));

    const accentColor = theme?.accentColor || (isDaylight ? '#3b82f6' : '#60a5fa');

    return (
        <SettingsAnchor anchorId="playbackEntryView" label={t(isAndroidNativeRuntime() ? 'mobileSettings.playbackDestination' : 'options.playbackEntryView')} nativeLayout={{"kind":"column"}}>
            <SettingsSectionHeading icon={MonitorPlay} label={t(isAndroidNativeRuntime() ? 'mobileSettings.playbackDestination' : 'options.playbackEntryView')} />
            <div className={`p-4 rounded-xl border space-y-4 ${settingsCardClass}`} data-settings-style='{"radius":12,"border":true,"gap":16,"padding":[16,16,16,16]}' data-settings-layout="card">
                <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                    {t(isAndroidNativeRuntime() ? 'mobileSettings.playbackDestinationDescription' : 'options.playbackEntryViewDesc')}
                </div>
                <PlaybackEntryViewOptions
                    value={playbackEntryView}
                    onChange={setPlaybackEntryView}
                    isDaylight={isDaylight}
                    accentColor={accentColor}
                />
            </div>
        </SettingsAnchor>
    );
};

export default PlaybackEntryViewSection;

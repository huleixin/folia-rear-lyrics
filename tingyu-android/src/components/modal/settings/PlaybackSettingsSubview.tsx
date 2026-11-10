import React, { useState } from 'react';
import MobilePlaybackStartupSetting from './MobilePlaybackStartupSetting';
import { AudioLines, ChevronRight, ListFilter, Monitor, PlayCircle, Radio, RefreshCw, Settings2, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { LocalLyricsPriority, QueueAddBehavior, ReplayGainMode, Theme } from '../../../types';
import { useAudioOutputDevices } from '../../../hooks/useAudioOutputDevices';
import { CustomSelect } from '../../shared/CustomSelect';
import { LYRIC_MATCH_SOURCES } from '../../../utils/lyrics/lyricMatchSources';
import { getLyricProviderPreferenceLabel } from '../../../utils/lyrics/lyricSourceLabels';
import TransitionSettingsSection from './TransitionSettingsSection';
import LocalLyricFormatOrderSetting from './LocalLyricFormatOrderSetting';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';
import { useLyricSettingsStore } from '../../../stores/useLyricSettingsStore';
import { useAudioSettingsStore } from '../../../stores/useAudioSettingsStore';
import { useOnlineProviderAccountStore } from '../../../stores/useOnlineProviderAccountStore';
import { isNeteaseScrobbleReady } from '../../../services/onlineMusic/playbackReportGate';

// src/components/modal/settings/PlaybackSettingsSubview.tsx
// Playback behavior and output-device settings extracted from the global settings modal.

interface MediaDevicesWithAudioOutput extends MediaDevices {
    selectAudioOutput?: (options?: { deviceId?: string; }) => Promise<{ deviceId: string; label?: string; }>;
}

type PlaybackSettingsSubviewProps = {
    isDaylight: boolean;
    onAudioOutputDeviceChange: (deviceId: string) => Promise<boolean> | boolean;
    onOpenGlobalLyricOffsetSettings: () => void;
    onOpenLyricFilterSettings: () => void;
    replayGainMode: ReplayGainMode;
    onReplayGainModeChange: (mode: ReplayGainMode) => void;
    settingsCardClass: string;
    theme?: Theme;
    utilityGhostButtonClass: string;
};

const PlaybackSettingsSubview: React.FC<PlaybackSettingsSubviewProps> = ({
    isDaylight,
    onAudioOutputDeviceChange,
    onOpenGlobalLyricOffsetSettings,
    onOpenLyricFilterSettings,
    replayGainMode,
    onReplayGainModeChange,
    settingsCardClass,
    theme,
    utilityGhostButtonClass,
}) => {
    const { t } = useTranslation();
    const {
        audioOutputDeviceId,
        enableTranscodeFallback,
        neteaseScrobbleEnabled,
        playbackFadeEnabled,
        autoSkipUnplayable,
        queueAddBehavior,
        onToggleTranscodeFallback,
        onToggleNeteaseScrobble,
        onTogglePlaybackFade,
        onToggleAutoSkipUnplayable,
        onQueueAddBehaviorChange,
    } = useAudioSettingsStore(useShallow(state => ({
        audioOutputDeviceId: state.audioOutputDeviceId,
        enableTranscodeFallback: state.enableTranscodeFallback,
        neteaseScrobbleEnabled: state.neteaseScrobbleEnabled,
        playbackFadeEnabled: state.playbackFadeEnabled,
        autoSkipUnplayable: state.autoSkipUnplayable,
        queueAddBehavior: state.queueAddBehavior,
        onToggleTranscodeFallback: state.handleToggleTranscodeFallback,
        onToggleNeteaseScrobble: state.handleToggleNeteaseScrobble,
        onTogglePlaybackFade: state.handleTogglePlaybackFade,
        onToggleAutoSkipUnplayable: state.handleToggleAutoSkipUnplayable,
        onQueueAddBehaviorChange: state.handleSetQueueAddBehavior,
    })));
    // Subscribed to rather than read once: the panel has to grey out the moment the NetEase account
    // signs out. `isNeteaseScrobbleReady` is the same predicate the command palette gates on, so the
    // two can never disagree about whether the toggle may be flipped.
    useOnlineProviderAccountStore(state => state.accounts.netease?.status);
    const canReportNeteasePlayback = isNeteaseScrobbleReady();
    const {
        autoUseBestLyric,
        preferredAlternativeLyricSource,
        localLyricsPriority,
        globalLyricTimelineOffsetMs,
        lyricVariant,
        onToggleAutoUseBestLyric,
        onPreferredAlternativeLyricSourceChange,
        onLocalLyricsPriorityChange,
        onLyricVariantChange,
    } = useLyricSettingsStore(useShallow(state => ({
        autoUseBestLyric: state.autoUseBestLyric,
        preferredAlternativeLyricSource: state.preferredAlternativeLyricSource,
        localLyricsPriority: state.localLyricsPriority,
        globalLyricTimelineOffsetMs: state.globalLyricTimelineOffsetMs,
        lyricVariant: state.lyricVariant,
        onToggleAutoUseBestLyric: state.handleToggleAutoUseBestLyric,
        onPreferredAlternativeLyricSourceChange: state.handleSetPreferredAlternativeLyricSource,
        onLocalLyricsPriorityChange: state.handleSetLocalLyricsPriority,
        onLyricVariantChange: state.handleSetLyricVariant,
    })));
    const {
        devices: audioOutputDevices,
        ensureLoaded: ensureAudioOutputDevicesLoaded,
        errorKey: audioOutputDevicesErrorKey,
        hasLoaded: hasLoadedAudioOutputDevices,
        isLoading: isAudioOutputDevicesLoading,
        isSupported: supportsAudioOutputSelection,
        refresh: refreshAudioOutputDevices,
        selectedDeviceLabel: selectedAudioOutputLabel,
        setErrorKey: setAudioOutputDevicesErrorKey,
    } = useAudioOutputDevices(audioOutputDeviceId);
    const [isSelectingAudioOutput, setIsSelectingAudioOutput] = useState(false);
    const mediaDevicesWithAudioOutput = navigator.mediaDevices as MediaDevicesWithAudioOutput | undefined;
    const accentOutlineColor = theme?.accentColor || (isDaylight ? '#44403c' : '#f4f4f5');
    const toggleOffBackgroundClass = isDaylight ? 'bg-zinc-300/90' : 'bg-white/10';

    // `disabled` rather than a `pointer-events-none` wrapper: that only stops the mouse, leaving the
    // button in the tab order and still operable with Enter or Space. Same shape as the one in
    // DesktopSettingsSubview.
    const renderToggle = (checked: boolean, onChange: () => void, disabled?: boolean) => (
        <button
            type="button"
            onClick={onChange}
            disabled={disabled}
            className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 disabled:cursor-not-allowed disabled:opacity-40 ${checked ? '' : toggleOffBackgroundClass}`}
            style={{ backgroundColor: checked ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined }}
            aria-pressed={checked}
         data-settings-style='{"width":48,"height":24,"radius":64,"padding":[4,4,4,4]}' data-settings-layout="column" data-settings-swatch={checked ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined}>
            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`}  data-settings-style='{"width":16,"height":16,"radius":64}' data-settings-layout="column"/>
        </button>
    );

    const getAccentOptionStyle = (selected: boolean) => (
        selected
            ? {
                borderColor: accentOutlineColor,
                boxShadow: `inset 0 0 0 1px ${accentOutlineColor}`,
                backgroundColor: isDaylight ? `${accentOutlineColor}12` : `${accentOutlineColor}18`,
            }
            : {
                borderColor: isDaylight ? 'rgba(24, 24, 27, 0.12)' : 'rgba(255, 255, 255, 0.1)',
                backgroundColor: isDaylight ? 'rgba(255, 255, 255, 0.72)' : 'rgba(255, 255, 255, 0.05)',
            }
    );

    const handleSelectAudioOutputDevice = async (deviceId: string) => {
        setAudioOutputDevicesErrorKey(null);

        if (!deviceId) {
            await onAudioOutputDeviceChange('');
            return;
        }

        if (!mediaDevicesWithAudioOutput?.selectAudioOutput) {
            await onAudioOutputDeviceChange(deviceId);
            return;
        }

        setIsSelectingAudioOutput(true);
        try {
            const selected = await mediaDevicesWithAudioOutput.selectAudioOutput({ deviceId });
            const applied = await onAudioOutputDeviceChange(selected.deviceId);
            if (applied) {
                await refreshAudioOutputDevices();
            } else {
                setAudioOutputDevicesErrorKey('options.audioOutputSelectFailed');
            }
        } catch (error) {
            console.error('[PlaybackSettingsSubview] Failed to select audio output device', error);
            setAudioOutputDevicesErrorKey('options.audioOutputSelectFailed');
        } finally {
            setIsSelectingAudioOutput(false);
        }
    };

    const audioOutputOptions = [
        { value: '', label: t('options.audioOutputDefault') },
        ...audioOutputDevices.map((device, index) => ({
            value: device.deviceId,
            label: device.label || `${t('options.audioOutputUnnamed')} ${index + 1}`,
        })),
    ];

    // The list is enumerated on demand, so a device saved in an earlier session needs its own entry
    // until then; without it the picker would look empty while a non-default output is active.
    if (audioOutputDeviceId && !audioOutputDevices.some(device => device.deviceId === audioOutputDeviceId)) {
        audioOutputOptions.push({
            value: audioOutputDeviceId,
            label: selectedAudioOutputLabel || t('options.audioOutputUnnamed'),
        });
    }

    return (
        <div className="space-y-5" data-settings-style='{"gap":20}' data-settings-layout="column">
            <MobilePlaybackStartupSetting isDaylight={isDaylight} settingsCardClass={settingsCardClass} theme={theme} />
            <SettingsAnchor anchorId="queueSettings" label={t('options.queueSettings')} nativeLayout={{"kind":"column"}}>
                <SettingsSectionHeading icon={PlayCircle} label={t('options.queueSettings')} />
                <div className={`p-4 rounded-xl border space-y-4 ${settingsCardClass}`} data-settings-style='{"radius":12,"border":true,"gap":16,"padding":[16,16,16,16]}' data-settings-layout="card">
                    <div className="space-y-1" data-settings-style='{"gap":4}' data-settings-layout="column">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                            {t('options.queueDefaultBehavior')}
                        </div>
                        <div className="text-[11px] opacity-50 max-w-[360px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                            {t('options.queueDefaultBehaviorDesc')}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2" data-settings-style='{"columns":2,"gap":8}' data-settings-layout="grid">
                        {([
                            { value: 'append', label: t('options.queueAppendLabel'), desc: t('options.queueAppendDesc') },
                            { value: 'next', label: t('options.queueNextLabel'), desc: t('options.queueNextDesc') },
                        ] as Array<{ value: QueueAddBehavior; label: string; desc: string }>).map((option) => {
                            const selected = queueAddBehavior === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => onQueueAddBehaviorChange(option.value)}
                                    className="rounded-xl border px-3 py-3 text-left transition-colors"
                                    style={getAccentOptionStyle(selected)}
                                 data-settings-style='{"radius":12,"border":true,"padding":[12,12,12,12]}' data-settings-layout="column">
                                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                        {option.label}
                                    </div>
                                    <div className="mt-1 text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted","margin":[0,4,0,0]}' data-settings-layout="column">
                                        {option.desc}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-start justify-between gap-3 border-t border-current/10 pt-4" data-settings-style='{"align":"between","gap":12,"padding":[0,16,0,0]}' data-settings-layout="row">
                        <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                {t('options.autoSkipUnplayable')}
                            </div>
                            <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                                {t('options.autoSkipUnplayableDesc')}
                            </div>
                        </div>
                        {renderToggle(autoSkipUnplayable, () => onToggleAutoSkipUnplayable(!autoSkipUnplayable))}
                    </div>
                </div>
            </SettingsAnchor>

            <SettingsAnchor anchorId="scrobbleSettings" label={t('options.scrobbleSettings')} nativeLayout={{"kind":"column"}}>
                <SettingsSectionHeading icon={Radio} label={t('options.scrobbleSettings')} />
                <div className={`p-4 rounded-xl border space-y-4 ${settingsCardClass}`} data-settings-style='{"radius":12,"border":true,"gap":16,"padding":[16,16,16,16]}' data-settings-layout="card">
                    <div className="flex items-start justify-between gap-3" data-settings-style='{"align":"between","gap":12}' data-settings-layout="row">
                        <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                {t('options.neteaseScrobble')}
                            </div>
                            <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                                {t('options.neteaseScrobbleDesc')}
                            </div>
                            {!canReportNeteasePlayback && (
                                <div className="text-[11px] max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                                    {t('options.neteaseScrobbleSignInHint')}
                                </div>
                            )}
                        </div>
                        {renderToggle(
                            neteaseScrobbleEnabled,
                            () => onToggleNeteaseScrobble(!neteaseScrobbleEnabled),
                            !canReportNeteasePlayback,
                        )}
                    </div>
                </div>
            </SettingsAnchor>

            <TransitionSettingsSection
                isDaylight={isDaylight}
                settingsCardClass={settingsCardClass}
                theme={theme}
            />

            <SettingsAnchor anchorId="replayGainSettings" label={t('options.replayGainSettings')} nativeLayout={{"kind":"column"}}>
                <SettingsSectionHeading icon={AudioLines} label={t('options.replayGainSettings')} />
                <div className={`p-4 rounded-xl border space-y-4 ${settingsCardClass}`} data-settings-style='{"radius":12,"border":true,"gap":16,"padding":[16,16,16,16]}' data-settings-layout="card">
                    <div className="space-y-1" data-settings-style='{"gap":4}' data-settings-layout="column">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                            {t('options.replayGainMode')}
                        </div>
                        <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                            {t('options.replayGainModeDesc')}
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2" data-settings-style='{"columns":3,"gap":8}' data-settings-layout="grid">
                        {([
                            { value: 'off', label: t('localMusic.replayGainOff') },
                            { value: 'track', label: t('localMusic.replayGainTrack') },
                            { value: 'album', label: t('localMusic.replayGainAlbum') },
                        ] as Array<{ value: ReplayGainMode; label: string }>).map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => onReplayGainModeChange(option.value)}
                                className="rounded-xl border px-3 py-2.5 text-center text-sm font-medium transition-colors"
                                style={getAccentOptionStyle(replayGainMode === option.value)}
                             data-settings-style='{"radius":12,"border":true,"center":true,"font":14,"weight":500,"padding":[12,10,12,10]}' data-settings-layout="row">
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            </SettingsAnchor>

            <SettingsAnchor anchorId="lyrics" label={t('options.lyrics')} nativeLayout={{"kind":"column"}}>
                <SettingsSectionHeading icon={Settings2} label={t('options.lyrics')} />
                <div className={`rounded-xl border overflow-hidden ${settingsCardClass}`} data-settings-style='{"radius":12,"border":true}' data-settings-layout="card">
                    <div className="p-4 flex items-center justify-between gap-4" data-settings-style='{"align":"between","gap":16,"padding":[16,16,16,16]}' data-settings-layout="row">
                        <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                            <div className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }} data-settings-style='{"align":"center","font":14,"weight":500,"gap":8,"tone":"text"}' data-settings-layout="row">
                                <Settings2 size={14} />
                                {t('options.autoUseBestLyric')}
                            </div>
                            <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                                {t('options.autoUseBestLyricDesc')}
                            </div>
                        </div>
                        {renderToggle(autoUseBestLyric, () => onToggleAutoUseBestLyric(!autoUseBestLyric))}
                    </div>
                    <div className="p-4 flex items-center justify-between gap-4 border-t" style={{ borderColor: 'var(--border-primary, rgba(255,255,255,0.06))' }} data-settings-style='{"align":"between","gap":16,"padding":[16,16,16,16]}' data-settings-layout="row">
                        <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                            <div className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }} data-settings-style='{"align":"center","font":14,"weight":500,"gap":8,"tone":"text"}' data-settings-layout="row">
                                {t('options.lyricVariantSimplified')}
                            </div>
                            <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                                {t('options.lyricVariantSimplifiedDesc')}
                            </div>
                        </div>
                        {renderToggle(lyricVariant === 't2s', () => onLyricVariantChange(lyricVariant === 't2s' ? 'off' : 't2s'))}
                    </div>
                    <div className="p-4 space-y-3 border-t" style={{ borderColor: 'var(--border-primary, rgba(255,255,255,0.06))' }} data-settings-style='{"gap":12,"padding":[16,16,16,16]}' data-settings-layout="column">
                        <div className="space-y-1" data-settings-style='{"gap":4}' data-settings-layout="column">
                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                {t('options.localLyricsPriority')}
                            </div>
                            <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                                {t('options.localLyricsPriorityDesc')}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2" data-settings-style='{"columns":2,"gap":8}' data-settings-layout="grid">
                            {([
                                { value: 'local', label: t('options.localLyricsPriorityLocal'), desc: t('options.localLyricsPriorityLocalDesc') },
                                { value: 'online', label: t('options.localLyricsPriorityOnline'), desc: t('options.localLyricsPriorityOnlineDesc') },
                            ] as Array<{ value: LocalLyricsPriority; label: string; desc: string }>).map((option) => {
                                const selected = localLyricsPriority === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        aria-pressed={selected}
                                        onClick={() => onLocalLyricsPriorityChange(option.value)}
                                        className="rounded-xl border px-3 py-3 text-left transition-colors"
                                        style={getAccentOptionStyle(selected)}
                                     data-settings-style='{"radius":12,"border":true,"padding":[12,12,12,12]}' data-settings-layout="column">
                                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                            {option.label}
                                        </div>
                                        <div className="mt-1 text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted","margin":[0,4,0,0]}' data-settings-layout="column">
                                            {option.desc}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <LocalLyricFormatOrderSetting getOptionStyle={getAccentOptionStyle} />
                    <div className="p-4 space-y-3 border-t" style={{ borderColor: 'var(--border-primary, rgba(255,255,255,0.06))' }} data-settings-style='{"gap":12,"padding":[16,16,16,16]}' data-settings-layout="column">
                            <div className="space-y-1" data-settings-style='{"gap":4}' data-settings-layout="column">
                                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                    {t('settings.lyricMatchPriority')}
                                </div>
                                <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                                    {t('settings.lyricMatchPriorityDesc')}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2" data-settings-style='{"columns":2,"gap":8,"margin":[0,8,0,0]}' data-settings-layout="grid">
                                {LYRIC_MATCH_SOURCES.map((source) => {
                                    const option = { value: source, label: getLyricProviderPreferenceLabel(source) };
                                    const selected = preferredAlternativeLyricSource === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => onPreferredAlternativeLyricSourceChange(option.value)}
                                            className="rounded-xl border px-3 py-2 text-center transition-colors"
                                            style={getAccentOptionStyle(selected)}
                                         data-settings-style='{"radius":12,"border":true,"center":true,"padding":[12,8,12,8]}' data-settings-layout="column">
                                            <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":12,"weight":500,"tone":"text"}' data-settings-layout="column">
                                                {option.label}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                    </div>
                    <button
                        type="button"
                        onClick={onOpenGlobalLyricOffsetSettings}
                        className="w-full p-4 border-t text-left transition-colors hover:bg-white/8"
                        style={{ borderColor: 'var(--border-primary, rgba(255,255,255,0.06))' }}
                     data-settings-style='{"padding":[16,16,16,16]}' data-settings-layout="column">
                        <div className="flex items-center justify-between gap-4" data-settings-style='{"align":"between","gap":16}' data-settings-layout="row">
                            <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                                <div className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }} data-settings-style='{"align":"center","font":14,"weight":500,"gap":8,"tone":"text"}' data-settings-layout="row">
                                    <Timer size={14} />
                                    {t('options.globalLyricTimelineOffset')}
                                </div>
                                <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                                    {t('options.globalLyricTimelineOffsetDesc')}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0" data-settings-style='{"align":"center","gap":8}' data-settings-layout="row">
                                <span className="font-mono text-xs opacity-70" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":12,"tone":"text"}' data-settings-layout="wrap">
                                    {globalLyricTimelineOffsetMs > 0 ? `+${globalLyricTimelineOffsetMs}` : globalLyricTimelineOffsetMs}ms
                                </span>
                                <ChevronRight size={18} className="opacity-60" style={{ color: 'var(--text-primary)' }} />
                            </div>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={onOpenLyricFilterSettings}
                        className="w-full p-4 border-t text-left transition-colors hover:bg-white/8"
                        style={{ borderColor: 'var(--border-primary, rgba(255,255,255,0.06))' }}
                     data-settings-style='{"padding":[16,16,16,16]}' data-settings-layout="column">
                        <div className="flex items-center justify-between gap-4" data-settings-style='{"align":"between","gap":16}' data-settings-layout="row">
                            <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                                <div className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }} data-settings-style='{"align":"center","font":14,"weight":500,"gap":8,"tone":"text"}' data-settings-layout="row">
                                    <ListFilter size={14} />
                                    {t('options.lyricFilterRegex')}
                                </div>
                                <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                                    {t('options.lyricFilterRegexDesc')}
                                </div>
                            </div>
                            <ChevronRight size={18} className="shrink-0 opacity-60" style={{ color: 'var(--text-primary)' }} />
                        </div>
                    </button>
                </div>
            </SettingsAnchor>

            <SettingsAnchor anchorId="audioOutputSettings" label={t('options.audioOutputSettings')} nativeLayout={{"kind":"column"}}>
                <SettingsSectionHeading icon={Monitor} label={t('options.audioOutputSettings')} />
                <div className={`p-4 rounded-xl border space-y-4 ${settingsCardClass}`} data-settings-style='{"radius":12,"border":true,"gap":16,"padding":[16,16,16,16]}' data-settings-layout="card">
                    <div className="flex items-start justify-between gap-3 border-b border-current/10 pb-4" data-settings-style='{"align":"between","gap":12,"divider":true,"padding":[0,0,0,16]}' data-settings-layout="row">
                        <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                {t('options.playbackFade')}
                            </div>
                            <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                                {t('options.playbackFadeDesc')}
                            </div>
                        </div>
                        {renderToggle(playbackFadeEnabled, () => onTogglePlaybackFade(!playbackFadeEnabled))}
                    </div>
                    {window.electron?.requestTranscodeFallback && (
                        <div className="flex items-start justify-between gap-3 border-b border-current/10 pb-4" data-settings-style='{"align":"between","gap":12,"divider":true,"padding":[0,0,0,16]}' data-settings-layout="row">
                            <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                    {t('options.transcodeFallback')}
                                </div>
                                <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                                    {t('options.transcodeFallbackDesc')}
                                </div>
                            </div>
                            {renderToggle(enableTranscodeFallback, () => onToggleTranscodeFallback(!enableTranscodeFallback))}
                        </div>
                    )}
                    <div className="flex items-start justify-between gap-3" data-settings-style='{"align":"between","gap":12}' data-settings-layout="row">
                        <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                {t('options.audioOutputDevice')}
                            </div>
                            <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                                {t('options.audioOutputDeviceDesc')}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => void refreshAudioOutputDevices()}
                            disabled={!supportsAudioOutputSelection || isAudioOutputDevicesLoading || isSelectingAudioOutput}
                            className={`shrink-0 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition-colors ${utilityGhostButtonClass} disabled:cursor-not-allowed disabled:opacity-45`}
                            style={{ color: 'var(--text-primary)' }}
                         data-settings-style='{"align":"center","gap":8,"radius":64,"border":true,"font":12,"padding":[12,8,12,8],"tone":"text"}' data-settings-layout="row">
                            <RefreshCw size={13} className={isAudioOutputDevicesLoading ? 'animate-spin' : ''} />
                            <span data-settings-layout="wrap">{t('options.audioOutputRefresh')}</span>
                        </button>
                    </div>

                    {!supportsAudioOutputSelection ? (
                        <div className="text-xs opacity-60" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                            {t('options.audioOutputUnsupported')}
                        </div>
                    ) : (
                        <div className="space-y-3" data-settings-style='{"gap":12}' data-settings-layout="column">
                            <CustomSelect
                                value={audioOutputDeviceId}
                                onChange={(val) => {
                                    void handleSelectAudioOutputDevice(val);
                                }}
                                options={audioOutputOptions}
                                onOpen={ensureAudioOutputDevicesLoaded}
                                ariaLabel={t('options.audioOutputDevice')}
                                disabled={isSelectingAudioOutput}
                                isDaylight={isDaylight}
                                theme={theme}
                            />

                            <div className="text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                                {isSelectingAudioOutput
                                    ? (t('options.audioOutputSelecting'))
                                    : isAudioOutputDevicesLoading
                                        ? (t('options.audioOutputLoading'))
                                        : (t('options.audioOutputDefaultDesc'))}
                            </div>

                            {audioOutputDevicesErrorKey && (
                                <div className="text-xs opacity-60" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                                    {t(audioOutputDevicesErrorKey)}
                                </div>
                            )}

                            {hasLoadedAudioOutputDevices && !isAudioOutputDevicesLoading && audioOutputDevices.length === 0 && !audioOutputDevicesErrorKey && (
                                <div className="text-xs opacity-60" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                                    {t('options.audioOutputEmpty')}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </SettingsAnchor>
        </div>
    );
};

export default PlaybackSettingsSubview;

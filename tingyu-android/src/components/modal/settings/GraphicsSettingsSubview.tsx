import StageQualitySettings from './StageQualitySettings';
import { isAndroidNativeRuntime } from '../../../utils/platform';
import React, { useState } from 'react';
import { Gauge, MonitorCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { Theme, VisualizerFrameRate } from '../../../types';
import SettingsFrameRateSlider from './SettingsFrameRateSlider';
import ThemedDialog from '../../shared/ThemedDialog';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';
import MotionReductionSettingsSection from './MotionReductionSettingsSection';
import SettingsRow, { SettingsToggle } from './SettingsRow';
import { settingsDividerClassFor } from './settingsCardClasses';
import { useThemeSettingsStore } from '../../../stores/useThemeSettingsStore';
import { usePlayerChromeSettingsStore } from '../../../stores/usePlayerChromeSettingsStore';
import { useVisualizerSettingsStore } from '../../../stores/useVisualizerSettingsStore';

// src/components/modal/settings/GraphicsSettingsSubview.tsx
// Everything that trades picture for smoothness or works around a renderer problem: static mode,
// the home background, native blur, the frame-rate cap, the Linux glow fix and reduced motion.
// Moved out of the lab page, where these sat among unrelated player-chrome switches.

/** Docs page behind the "Fix lyric animation freeze on Linux" switch. */
const CHROMIUM_FD_EXHAUSTION_DOCS_URL = 'https://folia-site.cielaniska.top/guide/chromium-fd-exhaustion';

/** On desktop a plain link would open inside the app window; hand it to the system browser instead. */
const openDocsLinkExternally = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!window.electron?.openExternalUrl) return;
    event.preventDefault();
    void window.electron.openExternalUrl(event.currentTarget.href);
};


type GraphicsSettingsSubviewProps = {
    isDaylight: boolean;
    settingsCardClass: string;
    toggleOffBackgroundClass: string;
    utilityGhostButtonClass: string;
    rangeInputClass: string;
    theme?: Theme;
};

const GraphicsSettingsSubview: React.FC<GraphicsSettingsSubviewProps> = ({
    isDaylight,
    settingsCardClass,
    toggleOffBackgroundClass,
    utilityGhostButtonClass,
    rangeInputClass,
    theme,
}) => {
    const { t } = useTranslation();
    const [isNativeBlurNoticeOpen, setIsNativeBlurNoticeOpen] = useState(false);
    const {
        disableHomeDynamicBackground,
        staticMode,
        onToggleDisableHomeDynamicBackground,
        onToggleStaticMode,
    } = useThemeSettingsStore(useShallow(state => ({
        disableHomeDynamicBackground: state.disableHomeDynamicBackground,
        staticMode: state.staticMode,
        onToggleDisableHomeDynamicBackground: state.handleToggleDisableHomeDynamicBackground,
        onToggleStaticMode: state.handleToggleStaticMode,
    })));
    const enablePlayerPageNativeBlur = usePlayerChromeSettingsStore(state => state.enablePlayerPageNativeBlur);
    const onTogglePlayerPageNativeBlur = usePlayerChromeSettingsStore(state => state.handleTogglePlayerPageNativeBlur);
    const visualizerFrameRate = useVisualizerSettingsStore(state => state.visualizerFrameRate);
    const onVisualizerFrameRateChange = useVisualizerSettingsStore(state => state.handleSetVisualizerFrameRate);
    const glowBlurQuantize = useVisualizerSettingsStore(state => state.glowBlurQuantize);
    const onToggleGlowBlurQuantize = useVisualizerSettingsStore(state => state.handleToggleGlowBlurQuantize);

    const dividerClass = settingsDividerClassFor(isDaylight);
    const isLinux = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('linux');
    const isVisualizerFrameRateLimiterEnabled = visualizerFrameRate !== 'off';
    const selectedVisualizerFrameRate = isVisualizerFrameRateLimiterEnabled ? visualizerFrameRate : 120;

    const renderToggle = (checked: boolean, onChange: () => void) => (
        <SettingsToggle checked={checked} onChange={onChange} offClass={toggleOffBackgroundClass} onColor={theme?.secondaryColor} />
    );

    // Native blur can drop frames on some GPUs, so switching it on goes through a confirmation.
    const handleNativeBlurToggle = () => {
        if (enablePlayerPageNativeBlur) {
            onTogglePlayerPageNativeBlur(false);
            return;
        }
        setIsNativeBlurNoticeOpen(true);
    };

    const confirmNativeBlur = () => {
        onTogglePlayerPageNativeBlur(true);
        setIsNativeBlurNoticeOpen(false);
    };

    return (
        <div className="space-y-5" data-settings-style='{"gap":20}' data-settings-layout="column">
            <SettingsAnchor anchorId="graphicsPerformance" label={t('options.labPerformanceSection')} className="space-y-4" nativeLayout={{"kind":"column","gap":16}}>
                <SettingsSectionHeading icon={MonitorCog} label={t('options.labPerformanceSection')} />
                <div className={`rounded-xl border overflow-hidden ${settingsCardClass}`} data-settings-style='{"radius":12,"border":true}' data-settings-layout="card">
                    <StageQualitySettings dividerClass={dividerClass} />
                    <SettingsRow
                        title={t(isAndroidNativeRuntime() ? 'mobileSettings.staticModeTitle' : 'options.enableStaticMode')}
                        description={t('options.enableStaticModeDesc')}
                        note={t('options.enableStaticModeDescSub')}
                        control={renderToggle(staticMode, () => onToggleStaticMode(!staticMode))}
                        dividerClass={dividerClass}
                    />
                    {!isAndroidNativeRuntime() && <SettingsRow
                        title={t('options.disableHomeDynamicBackground')}
                        description={t('options.disableHomeDynamicBackgroundDesc')}
                        note={t('options.disableHomeDynamicBackgroundWarning')}
                        control={renderToggle(disableHomeDynamicBackground, () => onToggleDisableHomeDynamicBackground(!disableHomeDynamicBackground))}
                        dividerClass={dividerClass}
                    />}
                    {!isLinux && !isAndroidNativeRuntime() && (
                        <SettingsRow
                            title={t('options.enablePlayerPageNativeBlur')}
                            description={t('options.enablePlayerPageNativeBlurDesc')}
                            control={renderToggle(enablePlayerPageNativeBlur, handleNativeBlurToggle)}
                            dividerClass={dividerClass}
                        />
                    )}
                    <SettingsRow
                        title={t(isAndroidNativeRuntime() ? 'mobileSettings.frameRateTitle' : 'options.visualizerFrameRate')}
                        description={t(isAndroidNativeRuntime() ? 'mobileSettings.frameRateDescription' : 'options.visualizerFrameRateDesc')}
                        control={renderToggle(
                            isVisualizerFrameRateLimiterEnabled,
                            () => onVisualizerFrameRateChange(isVisualizerFrameRateLimiterEnabled ? 'off' : selectedVisualizerFrameRate),
                        )}
                        dividerClass={dividerClass}
                    >
                        <SettingsFrameRateSlider value={selectedVisualizerFrameRate} disabled={!isVisualizerFrameRateLimiterEnabled}
                            onChange={onVisualizerFrameRateChange} className={rangeInputClass}/>
                    </SettingsRow>
                    {!isAndroidNativeRuntime() && <SettingsRow
                        title={t('options.glowBlurQuantize')}
                        description={(
                            <>
                                {t('options.glowBlurQuantizeDesc')}{' '}
                                <a
                                    href={CHROMIUM_FD_EXHAUSTION_DOCS_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={openDocsLinkExternally}
                                    className="underline underline-offset-2 hover:opacity-80"
                                 data-settings-layout="wrap">
                                    {t('options.glowBlurQuantizeDocs')}
                                </a>
                            </>
                        )}
                        control={renderToggle(glowBlurQuantize, () => onToggleGlowBlurQuantize(!glowBlurQuantize))}
                        dividerClass={dividerClass}
                        isLast
                    />}
                </div>
            </SettingsAnchor>

            <SettingsAnchor anchorId="graphicsMotion" label={t('options.reduceMotionSection')} className="space-y-4" nativeLayout={{"kind":"column","gap":16}}>
                <SettingsSectionHeading icon={Gauge} label={t('options.reduceMotionSection')} />
                <MotionReductionSettingsSection
                    settingsCardClass={settingsCardClass}
                    settingsDividerClass={dividerClass}
                    toggleOffBackgroundClass={toggleOffBackgroundClass}
                    theme={theme}
                />
            </SettingsAnchor>

            <ThemedDialog
                isOpen={isNativeBlurNoticeOpen}
                onClose={() => setIsNativeBlurNoticeOpen(false)}
                isDaylight={isDaylight}
                title={t('options.nativeBlurConfirmTitle')}
                footer={(
                    <>
                        <button
                            type="button"
                            onClick={() => setIsNativeBlurNoticeOpen(false)}
                            className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${utilityGhostButtonClass}`}
                            style={{ color: 'var(--text-primary)' }}
                         data-settings-style='{"radius":12,"border":true,"font":14,"weight":500,"padding":[16,8,16,8],"tone":"text"}' data-settings-layout="row">
                            {t('localMusic.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={confirmNativeBlur}
                            className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                            style={{ backgroundColor: theme?.accentColor || '#3b82f6' }}
                         data-settings-style='{"radius":12,"font":14,"weight":600,"padding":[16,8,16,8]}' data-settings-layout="row">
                            {t('options.nativeBlurConfirmAction')}
                        </button>
                    </>
                )}
            >
                <p className="text-sm leading-6 opacity-75" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":14,"tone":"muted"}' data-settings-layout="wrap">
                    {t('options.nativeBlurConfirmDesc')}
                </p>
            </ThemedDialog>
        </div>
    );
};

export default GraphicsSettingsSubview;

import React from 'react';
import { colorWithAlpha } from '../../colorMix';
import type { VisualizerBackgroundSettingsProps } from '../definition';
import BackgroundToggleRow from '../BackgroundToggleRow';

// src/components/visualizer/backgrounds/common/CommonBackgroundSettingsCard.tsx
// Configures the built-in cover-color and geometric background layers.

const CommonBackgroundSettingsCard: React.FC<VisualizerBackgroundSettingsProps> = ({
    config,
    actions,
    t,
    theme,
    controlCardBg,
    rangeInputClass,
    onSliderPointerDown,
    onSliderCommit,
}) => {
    const common = config?.common;
    const commonActions = actions?.common;
    const borderColor = colorWithAlpha(theme.secondaryColor, 0.16);
    const opacity = common?.opacity ?? 0.75;

    return (
        <>
            <div className="rounded-[24px] border p-4 space-y-4" style={{ backgroundColor: controlCardBg, borderColor }} data-settings-style='{"radius":24,"border":true,"gap":16,"padding":[16,16,16,16]}' data-settings-layout="card">
                <BackgroundToggleRow
                    label={t('options.disableVisualizerVignette')}
                    description={t('options.disableVisualizerVignetteDesc')}
                    checked={common?.disableVignette ?? false}
                    onChange={commonActions?.onDisableVignetteChange}
                    theme={theme}
                />
                <BackgroundToggleRow
                    label={t('options.disableVisualizerGeometricBackground')}
                    description={t('options.disableVisualizerGeometricBackgroundDesc')}
                    checked={common?.disableGeometricBackground ?? false}
                    onChange={commonActions?.onDisableGeometricChange}
                    theme={theme}
                />
            </div>

            <div className="rounded-[24px] border p-4 space-y-4" style={{ backgroundColor: controlCardBg, borderColor }} data-settings-style='{"radius":24,"border":true,"gap":16,"padding":[16,16,16,16]}' data-settings-layout="card">
                <div className="space-y-2" data-settings-style='{"gap":8}' data-settings-layout="column">
                    <div className="text-sm font-medium" style={{ color: theme.primaryColor }} data-settings-style='{"font":14,"weight":500}' data-settings-layout="column">
                        {t('options.previewCoverBackgroundSettings')}
                    </div>
                    <div className="text-xs opacity-70" style={{ color: theme.secondaryColor }} data-settings-style='{"font":12}' data-settings-layout="column">
                        {t('options.previewCoverBackgroundSettingsDesc')}
                    </div>
                    <BackgroundToggleRow
                        label={t('theme.addCoverColor')}
                        description={t('options.coverColorBackgroundDesc')}
                        checked={common?.useCoverColorBg ?? false}
                        onChange={commonActions?.onCoverColorChange}
                        theme={theme}
                    />
                    <div className="flex items-center justify-between text-sm" style={{ color: theme.primaryColor }} data-settings-style='{"align":"between","font":14}' data-settings-layout="row">
                        <span data-settings-style='{"grow":true}' data-settings-layout="wrap">{t('options.previewCoverBackgroundOpacity')}</span>
                        <span className="font-mono opacity-70" style={{ color: theme.secondaryColor }} data-settings-layout="wrap">
                            {Math.round(opacity * 100)}%
                        </span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={opacity}
                        onChange={event => commonActions?.onOpacityChange?.(Number(event.target.value))}
                        onPointerDown={onSliderPointerDown}
                        onPointerUp={onSliderCommit}
                        className={rangeInputClass}
                     data-settings-layout="column"/>
                </div>
            </div>
        </>
    );
};

export default CommonBackgroundSettingsCard;

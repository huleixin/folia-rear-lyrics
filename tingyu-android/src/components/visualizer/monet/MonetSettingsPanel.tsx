import React, { useMemo, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { DEFAULT_MONET_TUNING, type MonetAudioStyle, type MonetPortraitSource } from '../../../types';
import { colorWithAlpha } from '../colorMix';
import { type VisualizerSettingsPanelProps } from '../definition';

// src/components/visualizer/monet/MonetSettingsPanel.tsx
// Monet-specific lyric, audio, and portrait controls. Background controls live in the shared background panel.
type MonetSettingsTheme = VisualizerSettingsPanelProps['theme'];

interface PresetOption<T> {
    label: string;
    value: T;
    disabled?: boolean;
}

interface PresetGroupProps<T> {
    label: string;
    value: T;
    options: PresetOption<T>[];
    onChange: (value: T) => void;
    isDaylight: boolean;
    theme: MonetSettingsTheme;
}

interface SliderControlProps {
    label: string;
    valueLabel: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    rangeInputClass: string;
    onSliderPointerDown?: () => void;
    onSliderCommit?: () => void;
}

const clampValue = (value: number, min: number, max: number, fallback: number) => (
    Number.isFinite(value)
        ? Math.min(max, Math.max(min, value))
        : fallback
);

const SectionLabel: React.FC<{ children: React.ReactNode; theme: MonetSettingsTheme; }> = ({ children, theme }) => (
    <div className="text-xs font-medium uppercase tracking-[0.24em] opacity-45" style={{ color: theme.secondaryColor }} data-settings-style='{"font":12,"weight":500,"tone":"muted"}' data-settings-layout="column">
        {children}
    </div>
);

const PresetGroup = <T,>({
    label,
    value,
    options,
    onChange,
    isDaylight,
    theme,
}: PresetGroupProps<T>) => (
    <div className="space-y-2.5" data-settings-style='{"gap":10}' data-settings-layout="column">
        <SectionLabel theme={theme}>{label}</SectionLabel>
        <div className="flex flex-wrap gap-2" data-settings-style='{"gap":8}' data-settings-layout="wrap">
            {options.map(option => {
                const isActive = option.value === value;
                return (
                    <button
                        key={String(option.value)}
                        type="button"
                        onClick={() => {
                            if (!option.disabled) {
                                onChange(option.value);
                            }
                        }}
                        disabled={option.disabled}
                        className="rounded-full border px-3 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-45"
                        style={{
                            color: option.disabled ? colorWithAlpha(theme.secondaryColor, 0.72) : theme.primaryColor,
                            borderColor: isActive ? theme.accentColor : colorWithAlpha(theme.secondaryColor, isDaylight ? 0.18 : 0.14),
                            backgroundColor: isActive
                                ? colorWithAlpha(theme.accentColor, isDaylight ? 0.1 : 0.16)
                                : colorWithAlpha(theme.backgroundColor, isDaylight ? 0.24 : 0.34),
                            boxShadow: isActive ? `inset 0 0 0 1px ${theme.accentColor}` : 'none',
                        }}
                     data-settings-style='{"radius":64,"border":true,"font":14,"padding":[12,8,12,8]}' data-settings-layout="row">
                        {option.label}
                    </button>
                );
            })}
        </div>
    </div>
);

const SliderControl: React.FC<SliderControlProps> = ({
    label,
    valueLabel,
    value,
    min,
    max,
    step,
    onChange,
    rangeInputClass,
    onSliderPointerDown,
    onSliderCommit,
}) => (
    <div className="space-y-2" data-settings-style='{"gap":8}' data-settings-layout="column">
        <div className="flex items-center justify-between gap-3 text-sm" style={{ color: 'var(--text-primary)' }} data-settings-style='{"align":"between","gap":12,"font":14,"tone":"text"}' data-settings-layout="row">
            <span data-settings-style='{"grow":true}' data-settings-layout="wrap">{label}</span>
            <span className="font-mono opacity-70" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"tone":"muted"}' data-settings-layout="wrap">
                {valueLabel}
            </span>
        </div>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => onChange(parseFloat(event.target.value))}
            onPointerDown={onSliderPointerDown}
            onPointerUp={onSliderCommit}
            onPointerCancel={onSliderCommit}
            onBlur={onSliderCommit}
            className={rangeInputClass}
         data-settings-layout="column"/>
    </div>
);

export const MonetSettingsPanel: React.FC<VisualizerSettingsPanelProps> = ({
    t,
    isDaylight,
    theme,
    controlCardBg,
    rangeInputClass,
    monetTuning = DEFAULT_MONET_TUNING,
    onMonetTuningChange,
    monetPortraitImage,
    onUploadMonetPortraitImage,
    onClearMonetPortraitImage,
    isLoadingMonetPortraitImage = false,
    onSliderPointerDown,
    onSliderCommit,
}) => {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const resolvedTuning = {
        keywordColoringEnabled: monetTuning.keywordColoringEnabled ?? DEFAULT_MONET_TUNING.keywordColoringEnabled,
        showDescription: monetTuning.showDescription ?? DEFAULT_MONET_TUNING.showDescription,
        showAudioVisualization: monetTuning.showAudioVisualization ?? DEFAULT_MONET_TUNING.showAudioVisualization,
        audioStyle: monetTuning.audioStyle ?? DEFAULT_MONET_TUNING.audioStyle,
        fontScale: clampValue(monetTuning.fontScale ?? DEFAULT_MONET_TUNING.fontScale, 0.7, 1.5, DEFAULT_MONET_TUNING.fontScale),
        portraitSource: monetTuning.portraitSource ?? DEFAULT_MONET_TUNING.portraitSource,
        portraitStyle: monetTuning.portraitStyle ?? DEFAULT_MONET_TUNING.portraitStyle ?? 'rectangular',
        showPortraitDragHanger: monetTuning.showPortraitDragHanger ?? DEFAULT_MONET_TUNING.showPortraitDragHanger,
    };

    const keywordColoringOptions = useMemo<PresetOption<boolean>[]>(() => ([
        { value: true, label: t('options.monetKeywordColoringOn') },
        { value: false, label: t('options.monetKeywordColoringOff') },
    ]), [t]);
    const showDescriptionOptions = useMemo<PresetOption<boolean>[]>(() => ([
        { value: true, label: t('options.partitaGuideLinesOn') },
        { value: false, label: t('options.partitaGuideLinesOff') },
    ]), [t]);
    const portraitSourceOptions = useMemo<PresetOption<MonetPortraitSource>[]>(() => ([
        { value: 'cover', label: t('options.monetPortraitSourceCover') },
        {
            value: 'custom',
            label: t('options.monetPortraitSourceCustom'),
            disabled: !monetPortraitImage && !isLoadingMonetPortraitImage,
        },
    ]), [isLoadingMonetPortraitImage, monetPortraitImage, t]);
    const audioStyleOptions = useMemo<PresetOption<MonetAudioStyle>[]>(() => ([
        { value: 'bar', label: t('options.monetAudioStyleBar') },
        { value: 'line', label: t('options.monetAudioStyleLine') },
    ]), [t]);
    const showAudioVisualizationOptions = useMemo<PresetOption<boolean>[]>(() => ([
        { value: true, label: t('options.monetAudioVisualizationShow') },
        { value: false, label: t('options.monetAudioVisualizationHide') },
    ]), [t]);
    const portraitStyleOptions = useMemo<PresetOption<'rectangular' | 'square'>[]>(() => ([
        { value: 'rectangular', label: t('options.monetPortraitStyleRectangular') },
        { value: 'square', label: t('options.monetPortraitStyleSquare') },
    ]), [t]);
    const showPortraitDragHangerOptions = useMemo<PresetOption<boolean>[]>(() => ([
        { value: true, label: t('options.monetPortraitDragHangerShow') },
        { value: false, label: t('options.monetPortraitDragHangerHide') },
    ]), [t]);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        setFeedback(null);
        if (!files.length || !onUploadMonetPortraitImage) {
            return;
        }

        const result = await onUploadMonetPortraitImage(files);
        if (result.ok) {
            onMonetTuningChange?.({ portraitSource: 'custom' });
            setFeedback(files[0].name);
        } else {
            setFeedback(result.error || t('options.monetUploadPortrait'));
        }
    };

    return (
        <div
            className="space-y-4 rounded-[24px] border border-white/10 p-4"
            style={{ backgroundColor: controlCardBg }}
         data-settings-style='{"gap":16,"radius":24,"border":true,"padding":[16,16,16,16]}' data-settings-layout="card">
            <div className="space-y-1" data-settings-style='{"gap":4}' data-settings-layout="column">
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                    {t('options.monetSettings')}
                </div>
                <div className="text-xs opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                    {t('options.monetSettingsDesc')}
                </div>
            </div>

            {/* Section 1: Lyrics & Typography */}
            <div className="space-y-3.5 rounded-[18px] border border-white/5 p-3.5 bg-black/5 dark:bg-white/5" data-settings-style='{"gap":14,"radius":18,"border":true,"fill":true,"padding":[14,14,14,14]}' data-settings-layout="card">
                <div className="text-xs font-semibold uppercase tracking-wider opacity-65" style={{ color: theme.accentColor }} data-settings-style='{"font":12,"weight":600,"tone":"muted"}' data-settings-layout="column">
                    {t('options.lyricsStyleSettings')}
                </div>
                
                <SliderControl
                    label={t('options.monetFontScale')}
                    valueLabel={`${resolvedTuning.fontScale.toFixed(2)}x`}
                    min={0.7}
                    max={1.5}
                    step={0.05}
                    value={resolvedTuning.fontScale}
                    onChange={(value) => onMonetTuningChange?.({ fontScale: value })}
                    rangeInputClass={rangeInputClass}
                    onSliderPointerDown={onSliderPointerDown}
                    onSliderCommit={onSliderCommit}
                />

                <PresetGroup
                    label={t('options.monetKeywordColoring')}
                    value={resolvedTuning.keywordColoringEnabled}
                    options={keywordColoringOptions}
                    onChange={(value) => onMonetTuningChange?.({ keywordColoringEnabled: value })}
                    isDaylight={isDaylight}
                    theme={theme}
                />

                <PresetGroup
                    label={t('options.monetShowDescription')}
                    value={resolvedTuning.showDescription}
                    options={showDescriptionOptions}
                    onChange={(value) => onMonetTuningChange?.({ showDescription: value })}
                    isDaylight={isDaylight}
                    theme={theme}
                />
            </div>

            {/* Section 2: Portrait Character */}
            <div className="space-y-3.5 rounded-[18px] border border-white/5 p-3.5 bg-black/5 dark:bg-white/5" data-settings-style='{"gap":14,"radius":18,"border":true,"fill":true,"padding":[14,14,14,14]}' data-settings-layout="card">
                <div className="text-xs font-semibold uppercase tracking-wider opacity-65" style={{ color: theme.accentColor }} data-settings-style='{"font":12,"weight":600,"tone":"muted"}' data-settings-layout="column">
                    {t('options.cappellaAvatarSource')}
                </div>

                <PresetGroup
                    label={t('options.monetPortraitSource')}
                    value={resolvedTuning.portraitSource}
                    options={portraitSourceOptions}
                    onChange={(value) => onMonetTuningChange?.({ portraitSource: value })}
                    isDaylight={isDaylight}
                    theme={theme}
                />

                <PresetGroup
                    label={t('options.monetPortraitStyle')}
                    value={resolvedTuning.portraitStyle}
                    options={portraitStyleOptions}
                    onChange={(value) => onMonetTuningChange?.({ portraitStyle: value })}
                    isDaylight={isDaylight}
                    theme={theme}
                />

                <PresetGroup
                    label={t('options.monetPortraitDragHanger')}
                    value={resolvedTuning.showPortraitDragHanger}
                    options={showPortraitDragHangerOptions}
                    onChange={(value) => onMonetTuningChange?.({ showPortraitDragHanger: value })}
                    isDaylight={isDaylight}
                    theme={theme}
                />

                <div className="space-y-2.5" data-settings-style='{"gap":10}' data-settings-layout="column">
                    <SectionLabel theme={theme}>{t('options.monetUploadPortrait')}</SectionLabel>
                    <div className="flex flex-wrap items-center gap-2" data-settings-style='{"align":"center","gap":8}' data-settings-layout="wrap">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isLoadingMonetPortraitImage || !onUploadMonetPortraitImage}
                            className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-45"
                            style={{
                                color: theme.primaryColor,
                                borderColor: colorWithAlpha(theme.secondaryColor, isDaylight ? 0.18 : 0.14),
                                backgroundColor: colorWithAlpha(theme.backgroundColor, isDaylight ? 0.24 : 0.34),
                            }}
                         data-settings-style='{"align":"center","gap":8,"radius":64,"border":true,"font":14,"padding":[12,8,12,8]}' data-settings-layout="row">
                            <ImagePlus size={15} />
                            <span data-settings-layout="wrap">{t('options.monetUploadPortrait')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => void onClearMonetPortraitImage?.()}
                            disabled={!monetPortraitImage || !onClearMonetPortraitImage}
                            className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-45"
                            style={{
                                color: theme.primaryColor,
                                borderColor: colorWithAlpha(theme.secondaryColor, isDaylight ? 0.18 : 0.14),
                                backgroundColor: colorWithAlpha(theme.backgroundColor, isDaylight ? 0.24 : 0.34),
                            }}
                         data-settings-style='{"align":"center","gap":8,"radius":64,"border":true,"font":14,"padding":[12,8,12,8]}' data-settings-layout="row">
                            <Trash2 size={15} />
                            <span data-settings-layout="wrap">{t('options.monetClearPortrait')}</span>
                        </button>
                    </div>
                    <div className="text-xs opacity-60" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                        {feedback || monetPortraitImage?.name || '-'}
                    </div>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.gif,.webp,.svg,image/*"
                    className="hidden"
                    onChange={(event) => void handleFileChange(event)}
                 data-settings-layout="column"/>
            </div>

            {/* Section 3: Audio Spectrum */}
            <div className="space-y-3.5 rounded-[18px] border border-white/5 p-3.5 bg-black/5 dark:bg-white/5" data-settings-style='{"gap":14,"radius":18,"border":true,"fill":true,"padding":[14,14,14,14]}' data-settings-layout="card">
                <div className="text-xs font-semibold uppercase tracking-wider opacity-65" style={{ color: theme.accentColor }} data-settings-style='{"font":12,"weight":600,"tone":"muted"}' data-settings-layout="column">
                    {t('options.monetAudioStyle')}
                </div>

                <PresetGroup
                    label={t('options.monetShowAudioVisualization')}
                    value={resolvedTuning.showAudioVisualization}
                    options={showAudioVisualizationOptions}
                    onChange={(value) => onMonetTuningChange?.({ showAudioVisualization: value })}
                    isDaylight={isDaylight}
                    theme={theme}
                />

                <PresetGroup
                    label={t('options.monetAudioStyle')}
                    value={resolvedTuning.audioStyle}
                    options={audioStyleOptions}
                    onChange={(value) => onMonetTuningChange?.({ audioStyle: value })}
                    isDaylight={isDaylight}
                    theme={theme}
                />
            </div>
        </div>
    );
};

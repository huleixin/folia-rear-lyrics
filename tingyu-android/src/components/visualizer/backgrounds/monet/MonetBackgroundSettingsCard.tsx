import React, { useMemo, useRef, useState } from 'react';
import FastColorPicker from '../../../shared/FastColorPicker';
import { ImagePlus, Trash2 } from 'lucide-react';
import {
    DEFAULT_MONET_BACKGROUND_TUNING,
    type MonetBackgroundImage,
    type MonetBackgroundLayout,
    type MonetBackgroundSource,
    type MonetBackgroundTuning,
    type MonetBackgroundWashColorMode,
    type Theme,
} from '../../../../types';
import { colorWithAlpha } from '../../colorMix';
import BackgroundToggleRow from '../BackgroundToggleRow';

// src/components/visualizer/backgrounds/monet/MonetBackgroundSettingsCard.tsx
// Background settings for the shell-level Monet image layer.
interface PresetOption<T> {
    label: string;
    value: T;
    disabled?: boolean;
}

interface MonetBackgroundSettingsCardProps {
    t: (key: string) => string;
    isDaylight: boolean;
    theme: Theme;
    controlCardBg: string;
    rangeInputClass: string;
    tuning?: MonetBackgroundTuning;
    onTuningChange?: (patch: Partial<MonetBackgroundTuning>) => void;
    monetBackgroundImage?: MonetBackgroundImage | null;
    onUploadMonetBackgroundImage?: (files: File[]) => Promise<{ ok: boolean; error?: string; }>;
    onClearMonetBackgroundImage?: () => Promise<void> | void;
    isLoadingMonetBackgroundImage?: boolean;
    onSliderPointerDown?: () => void;
    onSliderCommit?: () => void;
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

const SectionLabel: React.FC<{ children: React.ReactNode; theme: Theme; }> = ({ children, theme }) => (
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
}: {
    label: string;
    value: T;
    options: PresetOption<T>[];
    onChange: (value: T) => void;
    isDaylight: boolean;
    theme: Theme;
}) => (
    <div className="space-y-2.5" data-settings-style='{"gap":10}' data-settings-layout="column">
        <SectionLabel theme={theme}>{label}</SectionLabel>
        <div className="flex flex-wrap gap-2" data-settings-style='{"gap":8}' data-settings-layout="wrap">
            {options.map(option => {
                const isActive = option.value === value;
                return (
                    <button
                        key={String(option.value)}
                        type="button"
                        aria-pressed={isActive}
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

const clampValue = (value: number, min: number, max: number, fallback: number) => (
    Number.isFinite(value)
        ? Math.min(max, Math.max(min, value))
        : fallback
);

const normalizeHexInput = (value: string) => {
    const withoutHash = value.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{6}$/.test(withoutHash)) {
        return `#${withoutHash.toLowerCase()}`;
    }

    return null;
};

export const MonetBackgroundSettingsCard: React.FC<MonetBackgroundSettingsCardProps> = ({
    t,
    isDaylight,
    theme,
    controlCardBg,
    rangeInputClass,
    tuning = DEFAULT_MONET_BACKGROUND_TUNING,
    onTuningChange,
    monetBackgroundImage,
    onUploadMonetBackgroundImage,
    onClearMonetBackgroundImage,
    isLoadingMonetBackgroundImage = false,
    onSliderPointerDown,
    onSliderCommit,
}) => {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const resolvedTuning = {
        backgroundSource: tuning.backgroundSource ?? DEFAULT_MONET_BACKGROUND_TUNING.backgroundSource,
        backgroundLayout: tuning.backgroundLayout ?? DEFAULT_MONET_BACKGROUND_TUNING.backgroundLayout,
        backgroundBlurPx: clampValue(tuning.backgroundBlurPx ?? DEFAULT_MONET_BACKGROUND_TUNING.backgroundBlurPx, 0, 60, DEFAULT_MONET_BACKGROUND_TUNING.backgroundBlurPx),
        backgroundOverlayOpacity: clampValue(tuning.backgroundOverlayOpacity ?? DEFAULT_MONET_BACKGROUND_TUNING.backgroundOverlayOpacity, 0, 1, DEFAULT_MONET_BACKGROUND_TUNING.backgroundOverlayOpacity),
        backgroundGrayscale: clampValue(tuning.backgroundGrayscale ?? DEFAULT_MONET_BACKGROUND_TUNING.backgroundGrayscale, 0, 1, DEFAULT_MONET_BACKGROUND_TUNING.backgroundGrayscale),
        backgroundSaturation: clampValue(tuning.backgroundSaturation ?? DEFAULT_MONET_BACKGROUND_TUNING.backgroundSaturation, 0, 2, DEFAULT_MONET_BACKGROUND_TUNING.backgroundSaturation),
        backgroundWash: clampValue(tuning.backgroundWash ?? DEFAULT_MONET_BACKGROUND_TUNING.backgroundWash, 0, 1, DEFAULT_MONET_BACKGROUND_TUNING.backgroundWash),
        backgroundHalfPaneOffsetX: clampValue(tuning.backgroundHalfPaneOffsetX ?? DEFAULT_MONET_BACKGROUND_TUNING.backgroundHalfPaneOffsetX, -40, 40, DEFAULT_MONET_BACKGROUND_TUNING.backgroundHalfPaneOffsetX),
        backgroundWashColorMode: tuning.backgroundWashColorMode ?? DEFAULT_MONET_BACKGROUND_TUNING.backgroundWashColorMode,
        backgroundWashCustomColor: normalizeHexInput(tuning.backgroundWashCustomColor) ?? DEFAULT_MONET_BACKGROUND_TUNING.backgroundWashCustomColor,
        backgroundDriftEnabled: tuning.backgroundDriftEnabled ?? DEFAULT_MONET_BACKGROUND_TUNING.backgroundDriftEnabled,
        backgroundDriftStrength: clampValue(tuning.backgroundDriftStrength ?? DEFAULT_MONET_BACKGROUND_TUNING.backgroundDriftStrength, 0, 1, DEFAULT_MONET_BACKGROUND_TUNING.backgroundDriftStrength),
        backgroundStreaksEnabled: tuning.backgroundStreaksEnabled ?? DEFAULT_MONET_BACKGROUND_TUNING.backgroundStreaksEnabled,
    };

    const sourceOptions = useMemo<PresetOption<MonetBackgroundSource>[]>(() => ([
        { value: 'cover-derived', label: t('options.monetBackgroundSourceCover') },
        {
            value: 'uploaded-global',
            label: t('options.monetBackgroundSourceUploaded'),
            disabled: !monetBackgroundImage && !isLoadingMonetBackgroundImage,
        },
    ]), [isLoadingMonetBackgroundImage, monetBackgroundImage, t]);
    const layoutOptions = useMemo<PresetOption<MonetBackgroundLayout>[]>(() => ([
        { value: 'half-pane-gradient', label: t('options.monetLayoutHalfPane') },
        { value: 'full-overlay', label: t('options.monetLayoutFullOverlay') },
    ]), [t]);
    const washModeOptions = useMemo<PresetOption<MonetBackgroundWashColorMode>[]>(() => ([
        { value: 'theme', label: t('options.monetBackgroundWashTheme') },
        { value: 'custom', label: t('options.monetBackgroundWashCustom') },
    ]), [t]);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        setFeedback(null);
        if (!files.length || !onUploadMonetBackgroundImage) {
            return;
        }

        const result = await onUploadMonetBackgroundImage(files);
        if (result.ok) {
            onTuningChange?.({ backgroundSource: 'uploaded-global' });
            setFeedback(files[0].name);
        } else {
            setFeedback(result.error || t('options.monetUploadBackground'));
        }
    };

    return (
        <div className="rounded-[24px] border p-4 space-y-4" style={{ backgroundColor: controlCardBg, borderColor: colorWithAlpha(theme.secondaryColor, 0.16) }} data-settings-style='{"radius":24,"border":true,"gap":16,"padding":[16,16,16,16]}' data-settings-layout="card">
            <div className="space-y-1" data-settings-style='{"gap":4}' data-settings-layout="column">
                <div className="text-sm font-medium" style={{ color: theme.primaryColor }} data-settings-style='{"font":14,"weight":500}' data-settings-layout="column">
                    {t('options.monetBackgroundSettings')}
                </div>
                <div className="text-xs opacity-70" style={{ color: theme.secondaryColor }} data-settings-style='{"font":12}' data-settings-layout="column">
                    {t('options.monetBackgroundSettingsDesc')}
                </div>
            </div>

            {/* Section 1: Background Source */}
            <div className="space-y-3.5 rounded-[18px] border border-white/5 p-3.5 bg-black/5 dark:bg-white/5" data-settings-style='{"gap":14,"radius":18,"border":true,"fill":true,"padding":[14,14,14,14]}' data-settings-layout="card">
                <div className="text-xs font-semibold uppercase tracking-wider opacity-65" style={{ color: theme.accentColor }} data-settings-style='{"font":12,"weight":600,"tone":"muted"}' data-settings-layout="column">
                    {t('options.monetGroupBackgroundSource')}
                </div>
                <PresetGroup
                    label={t('options.monetBackgroundSource')}
                    value={resolvedTuning.backgroundSource}
                    options={sourceOptions}
                    onChange={(value) => onTuningChange?.({ backgroundSource: value })}
                    isDaylight={isDaylight}
                    theme={theme}
                />

                <div className="space-y-2.5" data-settings-style='{"gap":10}' data-settings-layout="column">
                    <SectionLabel theme={theme}>{t('options.monetUploadBackground')}</SectionLabel>
                    <div className="flex flex-wrap items-center gap-2" data-settings-style='{"align":"center","gap":8}' data-settings-layout="wrap">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isLoadingMonetBackgroundImage || !onUploadMonetBackgroundImage}
                            className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-45"
                            style={{
                                color: theme.primaryColor,
                                borderColor: colorWithAlpha(theme.secondaryColor, isDaylight ? 0.18 : 0.14),
                                backgroundColor: colorWithAlpha(theme.backgroundColor, isDaylight ? 0.24 : 0.34),
                            }}
                         data-settings-style='{"align":"center","gap":8,"radius":64,"border":true,"font":14,"padding":[12,8,12,8]}' data-settings-layout="row">
                            <ImagePlus size={15} />
                            <span data-settings-layout="wrap">{t('options.monetUploadBackground')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => void onClearMonetBackgroundImage?.()}
                            disabled={!monetBackgroundImage || !onClearMonetBackgroundImage}
                            className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-45"
                            style={{
                                color: theme.primaryColor,
                                borderColor: colorWithAlpha(theme.secondaryColor, isDaylight ? 0.18 : 0.14),
                                backgroundColor: colorWithAlpha(theme.backgroundColor, isDaylight ? 0.24 : 0.34),
                            }}
                         data-settings-style='{"align":"center","gap":8,"radius":64,"border":true,"font":14,"padding":[12,8,12,8]}' data-settings-layout="row">
                            <Trash2 size={15} />
                            <span data-settings-layout="wrap">{t('options.monetClearBackground')}</span>
                        </button>
                    </div>
                    <div className="text-xs opacity-60" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                        {feedback || monetBackgroundImage?.name || '-'}
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".png,.jpg,.jpeg,.gif,.webp,.svg,image/*"
                        className="hidden"
                        onChange={(event) => void handleFileChange(event)}
                     data-settings-layout="column"/>
                </div>
            </div>

            {/* Section 2: Layout & Position */}
            <div className="space-y-3.5 rounded-[18px] border border-white/5 p-3.5 bg-black/5 dark:bg-white/5" data-settings-style='{"gap":14,"radius":18,"border":true,"fill":true,"padding":[14,14,14,14]}' data-settings-layout="card">
                <div className="text-xs font-semibold uppercase tracking-wider opacity-65" style={{ color: theme.accentColor }} data-settings-style='{"font":12,"weight":600,"tone":"muted"}' data-settings-layout="column">
                    {t('options.monetGroupLayoutPosition')}
                </div>
                <PresetGroup
                    label={t('options.monetBackgroundLayout')}
                    value={resolvedTuning.backgroundLayout}
                    options={layoutOptions}
                    onChange={(value) => onTuningChange?.({ backgroundLayout: value })}
                    isDaylight={isDaylight}
                    theme={theme}
                />

                {resolvedTuning.backgroundLayout === 'half-pane-gradient' && (
                    <SliderControl
                        label={t('options.monetHalfPaneOffsetX')}
                        valueLabel={`${Math.round(resolvedTuning.backgroundHalfPaneOffsetX)}%`}
                        min={-40}
                        max={40}
                        step={2}
                        value={resolvedTuning.backgroundHalfPaneOffsetX}
                        onChange={(value) => onTuningChange?.({ backgroundHalfPaneOffsetX: value })}
                        rangeInputClass={rangeInputClass}
                        onSliderPointerDown={onSliderPointerDown}
                        onSliderCommit={onSliderCommit}
                    />
                )}

                <BackgroundToggleRow
                    label={t('options.monetBackgroundDriftEnabled')}
                    description={t('options.monetBackgroundDriftEnabledDesc')}
                    checked={resolvedTuning.backgroundDriftEnabled}
                    onChange={backgroundDriftEnabled => onTuningChange?.({ backgroundDriftEnabled })}
                    theme={theme}
                />

                {resolvedTuning.backgroundDriftEnabled && (
                    <SliderControl
                        label={t('options.monetBackgroundDriftStrength')}
                        valueLabel={`${Math.round(resolvedTuning.backgroundDriftStrength * 100)}%`}
                        min={0}
                        max={1}
                        step={0.05}
                        value={resolvedTuning.backgroundDriftStrength}
                        onChange={(value) => onTuningChange?.({ backgroundDriftStrength: value })}
                        rangeInputClass={rangeInputClass}
                        onSliderPointerDown={onSliderPointerDown}
                        onSliderCommit={onSliderCommit}
                    />
                )}
            </div>

            {/* Section 3: Filters & Post-processing */}
            <div className="space-y-3.5 rounded-[18px] border border-white/5 p-3.5 bg-black/5 dark:bg-white/5" data-settings-style='{"gap":14,"radius":18,"border":true,"fill":true,"padding":[14,14,14,14]}' data-settings-layout="card">
                <div className="text-xs font-semibold uppercase tracking-wider opacity-65" style={{ color: theme.accentColor }} data-settings-style='{"font":12,"weight":600,"tone":"muted"}' data-settings-layout="column">
                    {t('options.monetGroupFiltersPostProcessing')}
                </div>
                <SliderControl
                    label={t('options.monetBackgroundBlur')}
                    valueLabel={`${Math.round(resolvedTuning.backgroundBlurPx)}px`}
                    min={0}
                    max={60}
                    step={2}
                    value={resolvedTuning.backgroundBlurPx}
                    onChange={(value) => onTuningChange?.({ backgroundBlurPx: value })}
                    rangeInputClass={rangeInputClass}
                    onSliderPointerDown={onSliderPointerDown}
                    onSliderCommit={onSliderCommit}
                />
                <SliderControl
                    label={t('options.monetBackgroundSaturation')}
                    valueLabel={`${Math.round(resolvedTuning.backgroundSaturation * 100)}%`}
                    min={0}
                    max={2}
                    step={0.05}
                    value={resolvedTuning.backgroundSaturation}
                    onChange={(value) => onTuningChange?.({ backgroundSaturation: value })}
                    rangeInputClass={rangeInputClass}
                    onSliderPointerDown={onSliderPointerDown}
                    onSliderCommit={onSliderCommit}
                />
                <SliderControl
                    label={t('options.monetBackgroundGrayscale')}
                    valueLabel={`${Math.round(resolvedTuning.backgroundGrayscale * 100)}%`}
                    min={0}
                    max={1}
                    step={0.02}
                    value={resolvedTuning.backgroundGrayscale}
                    onChange={(value) => onTuningChange?.({ backgroundGrayscale: value })}
                    rangeInputClass={rangeInputClass}
                    onSliderPointerDown={onSliderPointerDown}
                    onSliderCommit={onSliderCommit}
                />
            </div>

            {/* Section 4: Color Tint & Wash */}
            <div className="space-y-3.5 rounded-[18px] border border-white/5 p-3.5 bg-black/5 dark:bg-white/5" data-settings-style='{"gap":14,"radius":18,"border":true,"fill":true,"padding":[14,14,14,14]}' data-settings-layout="card">
                <div className="text-xs font-semibold uppercase tracking-wider opacity-65" style={{ color: theme.accentColor }} data-settings-style='{"font":12,"weight":600,"tone":"muted"}' data-settings-layout="column">
                    {t('options.monetGroupColorTintWash')}
                </div>
                <SliderControl
                    label={t('options.monetBackgroundOverlayOpacity')}
                    valueLabel={`${Math.round(resolvedTuning.backgroundOverlayOpacity * 100)}%`}
                    min={0}
                    max={1}
                    step={0.02}
                    value={resolvedTuning.backgroundOverlayOpacity}
                    onChange={(value) => onTuningChange?.({ backgroundOverlayOpacity: value })}
                    rangeInputClass={rangeInputClass}
                    onSliderPointerDown={onSliderPointerDown}
                    onSliderCommit={onSliderCommit}
                />
                <SliderControl
                    label={t('options.monetBackgroundWash')}
                    valueLabel={`${Math.round(resolvedTuning.backgroundWash * 100)}%`}
                    min={0}
                    max={1}
                    step={0.02}
                    value={resolvedTuning.backgroundWash}
                    onChange={(value) => onTuningChange?.({ backgroundWash: value })}
                    rangeInputClass={rangeInputClass}
                    onSliderPointerDown={onSliderPointerDown}
                    onSliderCommit={onSliderCommit}
                />

                <BackgroundToggleRow
                    label={t('options.monetBackgroundStreaksEnabled')}
                    description={t('options.monetBackgroundStreaksEnabledDesc')}
                    checked={resolvedTuning.backgroundStreaksEnabled}
                    onChange={backgroundStreaksEnabled => onTuningChange?.({ backgroundStreaksEnabled })}
                    theme={theme}
                />

                <PresetGroup
                    label={t('options.monetBackgroundWashColorMode')}
                    value={resolvedTuning.backgroundWashColorMode}
                    options={washModeOptions}
                    onChange={(value) => onTuningChange?.({ backgroundWashColorMode: value })}
                    isDaylight={isDaylight}
                    theme={theme}
                />

                {resolvedTuning.backgroundWashColorMode === 'custom' && (
                    <div className="space-y-3 rounded-[20px] border p-3" style={{ borderColor: colorWithAlpha(theme.secondaryColor, 0.14), backgroundColor: colorWithAlpha(theme.backgroundColor, 0.2) }} data-settings-style='{"gap":12,"radius":20,"border":true,"padding":[12,12,12,12]}' data-settings-layout="card">
                        <div className="flex items-center justify-between gap-3" data-settings-style='{"align":"between","gap":12}' data-settings-layout="row">
                            <div className="text-sm" style={{ color: theme.primaryColor }} data-settings-style='{"font":14,"grow":true}' data-settings-layout="column">
                                {t('options.monetBackgroundWashCustomColor')}
                            </div>
                            <div className="rounded-full px-3 py-1 text-xs font-mono" style={{ color: theme.backgroundColor, backgroundColor: resolvedTuning.backgroundWashCustomColor }} data-settings-style='{"radius":64,"font":12,"padding":[12,4,12,4]}' data-settings-layout="column">
                                {resolvedTuning.backgroundWashCustomColor.toUpperCase()}
                            </div>
                        </div>
                        <FastColorPicker
                            color={resolvedTuning.backgroundWashCustomColor}
                            onChange={(value) => onTuningChange?.({ backgroundWashCustomColor: value })}
                            height={180}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

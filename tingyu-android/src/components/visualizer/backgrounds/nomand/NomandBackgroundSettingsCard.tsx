import React, { useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { DEFAULT_NOMAND_BACKGROUND_TUNING, type MonetBackgroundImage, type NomandBackgroundSource, type NomandBackgroundTuning, type Theme } from '../../../../types';
import { colorWithAlpha } from '../../colorMix';
import BackgroundToggleRow from '../BackgroundToggleRow';
import NomandBackgroundEffectSettings from './NomandBackgroundEffectSettings';

// src/components/visualizer/backgrounds/nomand/NomandBackgroundSettingsCard.tsx
// Edits the Paper shader background while reusing the shared custom background image asset.

interface NomandBackgroundSettingsCardProps {
    t: (key: string) => string;
    isDaylight: boolean;
    theme: Theme;
    controlCardBg: string;
    rangeInputClass: string;
    tuning: NomandBackgroundTuning;
    onTuningChange?: (patch: Partial<NomandBackgroundTuning>) => void;
    monetBackgroundImage?: MonetBackgroundImage | null;
    onUploadMonetBackgroundImage?: (files: File[]) => Promise<{ ok: boolean; error?: string; }>;
    onClearMonetBackgroundImage?: () => Promise<void> | void;
    isLoadingMonetBackgroundImage?: boolean;
    onSliderPointerDown?: () => void;
    onSliderCommit?: () => void;
}

const NomandBackgroundSettingsCard: React.FC<NomandBackgroundSettingsCardProps> = ({
    t,
    isDaylight,
    theme,
    controlCardBg,
    rangeInputClass,
    tuning,
    onTuningChange,
    monetBackgroundImage,
    onUploadMonetBackgroundImage,
    onClearMonetBackgroundImage,
    isLoadingMonetBackgroundImage = false,
    onSliderPointerDown,
    onSliderCommit,
}) => {
    const resolvedTuning = { ...DEFAULT_NOMAND_BACKGROUND_TUNING, ...tuning };
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [feedback, setFeedback] = useState('');
    const borderColor = colorWithAlpha(theme.secondaryColor, isDaylight ? 0.18 : 0.16);
    const selectedBg = colorWithAlpha(theme.accentColor, isDaylight ? 0.1 : 0.16);

    const setSource = (imageSource: NomandBackgroundSource) => {
        onTuningChange?.({ imageSource });
    };

    const handleFiles = async (files: File[]) => {
        if (!files.length || !onUploadMonetBackgroundImage) return;
        const result = await onUploadMonetBackgroundImage(files);
        setFeedback(result.ok ? t('options.nomandBackgroundUploadSuccess') : result.error ?? t('options.nomandBackgroundUploadFailed'));
        if (result.ok) setSource('uploaded-global');
    };

    return (
        <div className="rounded-[24px] border p-4 space-y-4" style={{ backgroundColor: controlCardBg, borderColor }} data-settings-style='{"radius":24,"border":true,"gap":16,"padding":[16,16,16,16]}' data-settings-layout="card">
            <div className="space-y-1" data-settings-style='{"gap":4}' data-settings-layout="column">
                <div className="text-sm font-medium" style={{ color: theme.primaryColor }} data-settings-style='{"font":14,"weight":500}' data-settings-layout="column">
                    {t('options.nomandBackgroundSettings')}
                </div>
                <div className="text-xs opacity-70" style={{ color: theme.secondaryColor }} data-settings-style='{"font":12}' data-settings-layout="column">
                    {t('options.nomandBackgroundSettingsDesc')}
                </div>
            </div>

            <div className="space-y-2" data-settings-style='{"gap":8}' data-settings-layout="column">
                <div className="text-sm" style={{ color: theme.primaryColor }} data-settings-style='{"font":14}' data-settings-layout="column">
                    {t('options.nomandBackgroundSource')}
                </div>
                <div className="grid grid-cols-2 gap-2" data-settings-style='{"columns":2,"gap":8}' data-settings-layout="grid">
                    {([
                        ['cover-derived', t('options.monetBackgroundSourceCover')],
                        ['uploaded-global', t('options.monetBackgroundSourceUploaded')],
                    ] as const).map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            disabled={value === 'uploaded-global' && !monetBackgroundImage && !isLoadingMonetBackgroundImage}
                            onClick={() => setSource(value)}
                            className="rounded-2xl border px-3 py-2 text-sm disabled:opacity-40"
                            style={{
                                borderColor: resolvedTuning.imageSource === value ? theme.accentColor : borderColor,
                                backgroundColor: resolvedTuning.imageSource === value ? selectedBg : 'transparent',
                                color: theme.primaryColor,
                            }}
                         data-settings-style='{"radius":16,"border":true,"font":14,"padding":[12,8,12,8]}' data-settings-layout="row">
                            {label}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2" data-settings-style='{"gap":8}' data-settings-layout="wrap">
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={(event) => {
                            void handleFiles(Array.from(event.target.files ?? []));
                            event.target.value = '';
                        }}
                     data-settings-layout="column"/>
                    <button
                        type="button"
                        disabled={isLoadingMonetBackgroundImage || !onUploadMonetBackgroundImage}
                        onClick={() => inputRef.current?.click()}
                        className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs disabled:opacity-40"
                        style={{ borderColor, color: theme.primaryColor }}
                     data-settings-style='{"align":"center","gap":8,"radius":64,"border":true,"font":12,"padding":[12,8,12,8]}' data-settings-layout="row">
                        <Upload size={14} />
                        {t('options.monetUploadBackground')}
                    </button>
                    <button
                        type="button"
                        disabled={!monetBackgroundImage || !onClearMonetBackgroundImage}
                        onClick={() => void onClearMonetBackgroundImage?.()}
                        className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs disabled:opacity-40"
                        style={{ borderColor, color: theme.secondaryColor }}
                     data-settings-style='{"align":"center","gap":8,"radius":64,"border":true,"font":12,"padding":[12,8,12,8]}' data-settings-layout="row">
                        <Trash2 size={14} />
                        {t('options.monetClearBackground')}
                    </button>
                </div>
                <div className="truncate text-xs opacity-60" style={{ color: theme.secondaryColor }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                    {feedback || monetBackgroundImage?.name || '-'}
                </div>
            </div>

            <NomandBackgroundEffectSettings
                t={t}
                isDaylight={isDaylight}
                theme={theme}
                rangeInputClass={rangeInputClass}
                tuning={resolvedTuning}
                onTuningChange={onTuningChange}
                onSliderPointerDown={onSliderPointerDown}
                onSliderCommit={onSliderCommit}
            />

            <div className="space-y-3 rounded-2xl border p-3" style={{ borderColor }} data-settings-style='{"gap":12,"radius":16,"border":true,"padding":[12,12,12,12]}' data-settings-layout="card">
                <BackgroundToggleRow
                    label={t('options.nomandBackgroundOverlay')}
                    description={t('options.nomandBackgroundOverlayDesc')}
                    checked={resolvedTuning.overlayEnabled}
                    onChange={overlayEnabled => onTuningChange?.({ overlayEnabled })}
                    theme={theme}
                />
                <label className={`block space-y-2 ${resolvedTuning.overlayEnabled ? '' : 'opacity-45'}`} data-settings-style='{"gap":8}' data-settings-layout="wrap">
                    <span className="flex justify-between text-sm" style={{ color: theme.primaryColor }} data-settings-style='{"align":"between","font":14}' data-settings-layout="row">
                        <span data-settings-style='{"grow":true}' data-settings-layout="wrap">{t('options.nomandBackgroundOverlayOpacity')}</span>
                        <span className="font-mono opacity-70" data-settings-layout="wrap">{Math.round(resolvedTuning.overlayOpacity * 100)}%</span>
                    </span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={resolvedTuning.overlayOpacity}
                        disabled={!resolvedTuning.overlayEnabled}
                        onChange={event => onTuningChange?.({ overlayOpacity: Number(event.target.value) })}
                        onPointerDown={onSliderPointerDown}
                        onPointerUp={onSliderCommit}
                        className={rangeInputClass}
                     data-settings-layout="column"/>
                </label>
            </div>

        </div>
    );
};

export default NomandBackgroundSettingsCard;

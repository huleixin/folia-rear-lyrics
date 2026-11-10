import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
    DIORAMA_MOTE_CIRCUMFERENCE_MAX,
    DIORAMA_MOTE_CIRCUMFERENCE_MIN,
    DIORAMA_MOTE_CIRCUMFERENCE_STEP,
    DIORAMA_MOTE_RADIAL_MAX,
    DIORAMA_MOTE_RADIAL_MIN,
    DIORAMA_MOTE_RADIAL_STEP,
    type Theme,
} from '../../../types';
import { colorWithAlpha } from '../colorMix';
import { DioramaSettingsToggle } from './DioramaSettingsToggle';

// src/components/visualizer/diorama/DioramaBackgroundParticleSettings.tsx
// Collapsible controls for the background dust layer, matching the follow-sing effect groups. The dust
// sits in a shell around the flight axis, so its density has two INDEPENDENT axes: 圆周 (motes around each
// ring) and 径向 (layers across the shell's thickness, inner->outer). Motes-per-line = the product.
interface DioramaBackgroundParticleSettingsProps {
    label: string;
    enabled: boolean;
    circumference: number;
    radial: number;
    onEnabledChange: (next: boolean) => void;
    onCircumferenceChange: (next: number) => void;
    onRadialChange: (next: number) => void;
    t: (key: string) => string;
    isDaylight: boolean;
    theme: Theme;
    rangeInputClass: string;
    onSliderPointerDown?: () => void;
    onSliderCommit?: () => void;
}

export const DioramaBackgroundParticleSettings: React.FC<DioramaBackgroundParticleSettingsProps> = ({
    label,
    enabled,
    circumference,
    radial,
    onEnabledChange,
    onCircumferenceChange,
    onRadialChange,
    t,
    isDaylight,
    theme,
    rangeInputClass,
    onSliderPointerDown,
    onSliderCommit,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const controlsId = useId();

    const renderRange = (
        rowLabel: string,
        value: number,
        min: number,
        max: number,
        step: number,
        onChange: (next: number) => void,
    ) => (
        <div className="space-y-2" data-settings-style='{"gap":8}' data-settings-layout="column">
            <div className="flex items-center justify-between gap-3 text-sm" data-settings-style='{"align":"between","gap":12,"font":14}' data-settings-layout="row">
                <div className="min-w-0" style={{ color: 'var(--text-primary)' }} data-settings-style='{"tone":"text","grow":true}' data-settings-layout="column">{rowLabel}</div>
                <span className="shrink-0 font-mono opacity-70" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"tone":"muted"}' data-settings-layout="wrap">
                    {Math.round(value)}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                disabled={!enabled}
                aria-label={`${label} ${rowLabel}`}
                onChange={(event) => onChange(parseFloat(event.target.value))}
                onPointerDown={onSliderPointerDown}
                onPointerUp={onSliderCommit}
                className={`${rangeInputClass} disabled:cursor-not-allowed disabled:opacity-35`}
             data-settings-layout="column"/>
        </div>
    );

    return (
        <fieldset className="space-y-2.5" data-settings-style='{"gap":10}' data-settings-layout="column">
            <legend className="sr-only" data-settings-layout="column">{label}</legend>
            <div
                className="flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3"
                style={{
                    borderColor: colorWithAlpha(theme.secondaryColor, isDaylight ? 0.17 : 0.14),
                    backgroundColor: colorWithAlpha(theme.backgroundColor, isDaylight ? 0.24 : 0.34),
                }}
             data-settings-style='{"align":"between","gap":12,"radius":16,"border":true,"padding":[14,12,14,12],"fill":true}' data-settings-layout="row">
                <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={controlsId}
                    onClick={() => setIsExpanded(expanded => !expanded)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                 data-settings-style='{"align":"center","grow":true,"gap":8}' data-settings-layout="row">
                    <ChevronDown
                        size={16}
                        aria-hidden="true"
                        className={`shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        style={{ color: 'var(--text-secondary)' }}
                    />
                    <span className="min-w-0" data-settings-layout="column">
                        <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                            {label}
                        </span>
                    </span>
                </button>
                <DioramaSettingsToggle
                    checked={enabled}
                    label={label}
                    onChange={onEnabledChange}
                    theme={theme}
                    isDaylight={isDaylight}
                />
            </div>

            {isExpanded && (
                <div
                    id={controlsId}
                    className="ml-3 space-y-3 border-l pl-3"
                    style={{ borderColor: colorWithAlpha(theme.accentColor, enabled ? 0.3 : 0.12) }}
                 data-settings-style='{"gap":12,"padding":[12,0,0,0],"margin":[12,0,0,0]}' data-settings-layout="column">
                    {renderRange(
                        t('options.dioramaMoteCircumference'),
                        circumference,
                        DIORAMA_MOTE_CIRCUMFERENCE_MIN,
                        DIORAMA_MOTE_CIRCUMFERENCE_MAX,
                        DIORAMA_MOTE_CIRCUMFERENCE_STEP,
                        onCircumferenceChange,
                    )}
                    {renderRange(
                        t('options.dioramaMoteRadial'),
                        radial,
                        DIORAMA_MOTE_RADIAL_MIN,
                        DIORAMA_MOTE_RADIAL_MAX,
                        DIORAMA_MOTE_RADIAL_STEP,
                        onRadialChange,
                    )}
                </div>
            )}
        </fieldset>
    );
};

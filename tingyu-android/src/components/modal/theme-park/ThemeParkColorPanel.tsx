import React from 'react';
import { useTranslation } from 'react-i18next';
import type { DualTheme } from '../../../types';
import FastColorPicker from '../../shared/FastColorPicker';
import { COLOR_FIELDS, type EditableColorKey, type EditableMode } from './themeParkDraft';

// src/components/modal/theme-park/ThemeParkColorPanel.tsx
// Color tab of the Theme Park editor: light/dark switch, the four theme color slots, the picker
// with its hex field, and the cover-derived recommended swatches.

type ThemeParkColorPanelProps = {
    mode: EditableMode;
    onModeChange: (mode: EditableMode) => void;
    activeColorKey: EditableColorKey;
    onActiveColorKeyChange: (key: EditableColorKey) => void;
    safeDraft: DualTheme;
    rawColorValue: string;
    recommendedColors: string[];
    isDaylight: boolean;
    onColorDrag: (color: string) => void;
    onColorPick: (color: string) => void;
    onHexInput: (value: string) => void;
    onHexCommit: () => void;
};

const ThemeParkColorPanel: React.FC<ThemeParkColorPanelProps> = ({
    mode,
    onModeChange,
    activeColorKey,
    onActiveColorKeyChange,
    safeDraft,
    rawColorValue,
    recommendedColors,
    isDaylight,
    onColorDrag,
    onColorPick,
    onHexInput,
    onHexCommit,
}) => {
    const { t } = useTranslation();
    const activeTheme = safeDraft[mode];
    const activeColor = activeTheme[activeColorKey];
    const pickerField = COLOR_FIELDS.find(field => field.key === activeColorKey) ?? COLOR_FIELDS[0];
    const idleBorderColor = isDaylight ? 'rgba(24,24,27,0.08)' : 'rgba(255,255,255,0.08)';
    const selectedBg = isDaylight ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.07)';

    return (
        <div className="space-y-4" data-settings-style='{"gap":16}' data-settings-layout="column">
            <div className="flex items-center gap-2 rounded-full bg-white/5 p-1" data-settings-style='{"align":"center","gap":8,"radius":64,"fill":true,"padding":[4,4,4,4]}' data-settings-layout="row">
                {(['light', 'dark'] as EditableMode[]).map(nextMode => (
                    <button
                        key={nextMode}
                        type="button"
                        aria-pressed={mode === nextMode}
                        onClick={() => onModeChange(nextMode)}
                        className="flex-1 rounded-full px-3 py-2 text-sm transition-colors"
                        style={{
                            color: 'var(--text-primary)',
                            backgroundColor: mode === nextMode
                                ? (isDaylight ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.12)')
                                : 'transparent',
                        }}
                     data-settings-style='{"grow":true,"radius":64,"font":14,"padding":[12,8,12,8],"tone":"text"}' data-settings-layout="row">
                        {t(nextMode === 'light' ? 'options.lightTheme' : 'options.darkTheme')}
                    </button>
                ))}
            </div>

            <div className="space-y-3" data-settings-style='{"gap":12}' data-settings-layout="column">
                {COLOR_FIELDS.map(field => {
                    const colorValue = activeTheme[field.key];
                    const isActive = activeColorKey === field.key;

                    return (
                        <button
                            key={`${mode}-${field.key}`}
                            type="button"
                            aria-pressed={isActive}
                            onClick={() => onActiveColorKeyChange(field.key)}
                            className="flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all"
                            style={{
                                borderColor: isActive ? activeTheme.accentColor : idleBorderColor,
                                backgroundColor: isActive ? selectedBg : 'transparent',
                            }}
                         data-settings-style='{"align":"center","gap":12,"radius":16,"border":true,"padding":[12,12,12,12]}' data-settings-layout="row">
                            <div className="h-10 w-10 rounded-xl border border-black/10" style={{ backgroundColor: colorValue }}  data-settings-style='{"height":40,"width":40,"radius":12,"border":true}' data-settings-layout="card" data-settings-swatch={colorValue}/>
                            <div className="min-w-0 flex-1" data-settings-style='{"grow":true}' data-settings-layout="column">
                                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                    {t(field.labelKey)}
                                </div>
                                <div className="mt-0.5 text-xs opacity-55" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted","margin":[0,2,0,0]}' data-settings-layout="column">
                                    {t(field.descKey)}
                                </div>
                            </div>
                            <div className="text-xs font-mono opacity-70" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                                {colorValue.toUpperCase()}
                            </div>
                        </button>
                    );
                })}
            </div>

            <div className="relative z-40 space-y-3 rounded-[24px] border border-white/10 p-4" data-settings-style='{"gap":12,"radius":24,"border":true,"padding":[16,16,16,16]}' data-settings-layout="card">
                <div className="flex items-center justify-between" data-settings-style='{"align":"between"}' data-settings-layout="row">
                    <div data-settings-style='{"grow":true}' data-settings-layout="column">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                            {t(pickerField.labelKey)}
                        </div>
                        <div className="mt-1 text-xs opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted","margin":[0,4,0,0]}' data-settings-layout="column">
                            {t(pickerField.descKey)}
                        </div>
                    </div>
                    <div className="rounded-full px-3 py-1 text-xs font-mono" style={{ color: activeTheme.backgroundColor, backgroundColor: activeColor }} data-settings-style='{"radius":64,"font":12,"padding":[12,4,12,4]}' data-settings-layout="column">
                        {activeColor.toUpperCase()}
                    </div>
                </div>

                <div className="rounded-[22px] border border-white/10 bg-black/10 p-3" data-settings-style='{"radius":22,"border":true,"fill":true,"padding":[12,12,12,12]}' data-settings-layout="card">
                    <FastColorPicker
                        color={activeColor}
                        height={220}
                        onChange={onColorDrag}
                    />
                </div>

                <label className="block space-y-2" data-settings-style='{"gap":8}' data-settings-layout="column">
                    <div className="text-xs font-medium uppercase tracking-[0.22em] opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"weight":500,"tone":"muted"}' data-settings-layout="column">
                        HEX
                    </div>
                    <input
                        type="text"
                        value={rawColorValue}
                        onChange={(event) => onHexInput(event.target.value)}
                        onBlur={onHexCommit}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm outline-none transition-colors focus:border-white/20"
                        style={{ color: 'var(--text-primary)' }}
                        spellCheck={false}
                     data-settings-style='{"radius":16,"border":true,"fill":true,"font":14,"padding":[16,12,16,12],"tone":"text"}' data-settings-layout="column"/>
                </label>
            </div>

            {recommendedColors.length > 0 && (
                <div className="space-y-2 rounded-[24px] border border-white/10 p-4" data-settings-style='{"gap":8,"radius":24,"border":true,"padding":[16,16,16,16]}' data-settings-layout="card">
                    <div className="text-xs font-medium uppercase tracking-[0.22em] opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"weight":500,"tone":"muted"}' data-settings-layout="column">
                        {t('options.aiThemeQuickEditRecommendedColors')}
                    </div>
                    <div className="flex flex-wrap gap-2" data-settings-style='{"gap":8}' data-settings-layout="wrap">
                        {recommendedColors.map(color => (
                            <button
                                key={color}
                                type="button"
                                onClick={() => onColorPick(color)}
                                className="h-8 w-8 rounded-lg border border-white/15 transition-transform hover:scale-110 active:scale-95"
                                style={{ backgroundColor: color }}
                                title={color.toUpperCase()}
                                aria-label={color}
                             data-settings-style='{"height":32,"width":32,"radius":8,"border":true}' data-settings-layout="row" data-settings-swatch={color}/>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ThemeParkColorPanel;

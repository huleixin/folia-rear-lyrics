import React from 'react';
import { colorWithAlpha } from './colorMix';
import { type VisualizerSettingsPanelProps } from './definition';

// src/components/visualizer/VisualizerPresetGroup.tsx
// Renders theme-aware pill controls shared by visualizer tuning panels.
export interface VisualizerPresetOption<T> {
    label: string;
    value: T;
}

interface VisualizerPresetGroupProps<T> {
    label: string;
    value: T;
    options: VisualizerPresetOption<T>[];
    onChange: (next: T) => void;
    isDaylight: boolean;
    theme: VisualizerSettingsPanelProps['theme'];
}

const VisualizerPresetGroup = <T,>({
    label,
    value,
    options,
    onChange,
    isDaylight,
    theme,
}: VisualizerPresetGroupProps<T>) => (
    <div className="space-y-2.5" data-settings-layout="column" data-settings-style='{"gap":10}'>
        <div className="text-xs font-medium uppercase tracking-[0.24em] opacity-45" style={{ color: theme.secondaryColor }}
            data-settings-layout="wrap" data-settings-style='{"font":12,"weight":500,"tone":"muted"}'>
            {label}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={label}
            data-settings-layout="wrap" data-settings-style='{"gap":8}'>
            {options.map(option => {
                const isActive = option.value === value;

                return (
                    <button
                        key={String(option.value)}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => onChange(option.value)}
                        className="px-3 py-2 rounded-full text-sm transition-all border"
                        data-settings-layout="row"
                        data-settings-style='{"radius":64,"border":true,"font":14,"padding":[12,8,12,8],"center":true}'
                        style={{
                            color: theme.primaryColor,
                            borderColor: isActive ? theme.accentColor : colorWithAlpha(theme.secondaryColor, isDaylight ? 0.18 : 0.14),
                            backgroundColor: isActive
                                ? colorWithAlpha(theme.accentColor, isDaylight ? 0.1 : 0.16)
                                : colorWithAlpha(theme.backgroundColor, isDaylight ? 0.24 : 0.34),
                            boxShadow: isActive ? `inset 0 0 0 1px ${theme.accentColor}` : 'none',
                        }}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    </div>
);

export default VisualizerPresetGroup;

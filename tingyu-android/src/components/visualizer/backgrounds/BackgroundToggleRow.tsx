import React from 'react';
import type { Theme } from '../../../types';
import { colorWithAlpha } from '../colorMix';

// src/components/visualizer/backgrounds/BackgroundToggleRow.tsx
// Shared themed switch row for shell background settings.

interface BackgroundToggleRowProps {
    label: string;
    description?: string;
    checked: boolean;
    onChange?: (checked: boolean) => void;
    theme: Theme;
}

const BackgroundToggleRow: React.FC<BackgroundToggleRowProps> = ({
    label,
    description,
    checked,
    onChange,
    theme,
}) => (
    <div className="flex items-center justify-between gap-4" data-settings-style='{"align":"between","gap":16}' data-settings-layout="row">
        <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
            <div className="text-sm font-medium" style={{ color: theme.primaryColor }} data-settings-style='{"font":14,"weight":500}' data-settings-layout="column">{label}</div>
            {description && (
                <div className="max-w-[320px] text-xs opacity-70" style={{ color: theme.secondaryColor }} data-settings-style='{"font":12}' data-settings-layout="column">
                    {description}
                </div>
            )}
        </div>
        <button
            type="button"
            aria-pressed={checked}
            disabled={!onChange}
            onClick={() => onChange?.(!checked)}
            className="h-6 w-12 shrink-0 rounded-full p-1 transition-colors disabled:opacity-45"
            style={{ backgroundColor: checked ? theme.secondaryColor : colorWithAlpha(theme.secondaryColor, 0.18) }}
         data-settings-style='{"height":24,"width":48,"radius":64,"padding":[4,4,4,4]}' data-settings-layout="column" data-settings-swatch={checked ? theme.secondaryColor : colorWithAlpha(theme.secondaryColor, 0.18)}>
            <div
                className={`h-4 w-4 rounded-full shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`}
                style={{ backgroundColor: theme.backgroundColor }}
             data-settings-style='{"height":16,"width":16,"radius":64}' data-settings-layout="column" data-settings-swatch={theme.backgroundColor}/>
        </button>
    </div>
);

export default BackgroundToggleRow;

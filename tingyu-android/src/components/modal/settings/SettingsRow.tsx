import React from 'react';

// src/components/modal/settings/SettingsRow.tsx
// One row inside a grouped settings card: title and description on the left, the control on the
// right, a hairline under every row but the card's last. The rows share a card so a section reads
// as one block instead of a stack of separate boxes.

type SettingsRowProps = {
    title: React.ReactNode;
    description?: React.ReactNode;
    /** A second, quieter line for caveats that should not compete with the description. */
    note?: React.ReactNode;
    /** Usually a toggle; anything that sits at the row's right edge. */
    control?: React.ReactNode;
    /** Content under the title block that spans the row's full width, e.g. a slider. */
    children?: React.ReactNode;
    dividerClass: string;
    isLast?: boolean;
};

const SettingsRow: React.FC<SettingsRowProps> = ({
    title,
    description,
    note,
    control,
    children,
    dividerClass,
    isLast = false,
}) => (
    <div data-settings-row className={`p-4 space-y-3${isLast ? '' : ` border-b ${dividerClass}`}`} data-settings-style={JSON.stringify({gap:12,padding:[16,16,16,16],divider:!isLast})} data-settings-layout="column">
        <div className="flex items-center justify-between gap-4" data-settings-style='{"align":"between","gap":16}' data-settings-layout="row">
            <div className="space-y-1 text-left min-w-0" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                <div data-settings-title className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }} data-settings-style='{"align":"center","font":14,"weight":500,"gap":8,"tone":"text"}' data-settings-layout="row">
                    {title}
                </div>
                {description && (
                    <div data-settings-description className="text-xs opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                        {description}
                    </div>
                )}
                {note && (
                    <div data-settings-note className="text-[11px] opacity-40 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                        {note}
                    </div>
                )}
            </div>
            {control}
        </div>
        {children}
    </div>
);

type SettingsToggleProps = {
    checked: boolean;
    onChange: () => void;
    offClass: string;
    /** Track color when on; the theme's secondary color in every settings page. */
    onColor?: string;
    disabled?: boolean;
    ariaLabel?: string;
};

export const SettingsToggle: React.FC<SettingsToggleProps> = ({ checked, onChange, offClass, onColor, disabled, ariaLabel }) => (
    <button
        type="button"
        onClick={onChange}
        disabled={disabled}
        aria-pressed={checked}
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        className={`shrink-0 w-12 h-6 rounded-full p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${checked ? '' : offClass}`}
        style={{ backgroundColor: checked ? onColor || 'rgba(114, 119, 134, 1)' : undefined }}
     data-settings-style='{"width":48,"height":24,"radius":64,"padding":[4,4,4,4]}' data-settings-layout="column" data-settings-swatch={checked ? onColor || 'rgba(114, 119, 134, 1)' : undefined}>
        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`}  data-settings-style='{"width":16,"height":16,"radius":64}' data-settings-layout="column"/>
    </button>
);

export default SettingsRow;

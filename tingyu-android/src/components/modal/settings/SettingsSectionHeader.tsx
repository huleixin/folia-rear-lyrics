import { isAndroidNativeRuntime } from '../../../utils/platform';
import React from 'react';
import { Moon, Sun } from 'lucide-react';
// src/components/modal/settings/SettingsSectionHeader.tsx
// Title block above the active settings section, plus the appearance-only daylight toggle.

type SettingsSectionHeaderProps = {
    title: string;
    description: string;
    /** Only the appearance section carries the daylight switch. */
    showDaylightToggle: boolean;
    isDaylight: boolean;
    onSetDaylightPreference: (enabled: boolean) => void;
    daylightLabel: string;
    utilityGhostButtonClass: string;
    compact?: boolean;
};

export const SettingsSectionHeader: React.FC<SettingsSectionHeaderProps> = ({
    title,
    description,
    showDaylightToggle,
    isDaylight,
    onSetDaylightPreference,
    daylightLabel,
    utilityGhostButtonClass,
    compact = false,
}) => compact ? null : (
    <div className="mb-4 md:mb-6 border-b border-white/10 pb-3 md:pb-4" data-settings-style='{"divider":true,"padding":[0,0,0,12],"margin":[0,0,0,16]}' data-settings-layout="column">
        <div className="flex items-start justify-between gap-4" data-settings-style='{"align":"between","gap":16}' data-settings-layout="row">
            <div data-settings-style='{"grow":true}' data-settings-layout="column">
                {!compact && <h2 className="text-lg md:text-xl font-semibold" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":18,"weight":600,"tone":"text"}' data-settings-layout="wrap">
                    {title}
                </h2>}
                <p className="text-xs opacity-50 mt-1" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted","margin":[0,4,0,0]}' data-settings-layout="wrap">
                    {compact ? daylightLabel : description}
                </p>
            </div>
            {showDaylightToggle && !isAndroidNativeRuntime() && (
                <button
                    type="button"
                    onClick={() => onSetDaylightPreference(!isDaylight)}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${utilityGhostButtonClass} ${isDaylight ? 'text-amber-500' : 'text-blue-300'}`}
                    title={daylightLabel}
                    aria-label={daylightLabel}
                    aria-pressed={isDaylight}
                 data-settings-style='{"align":"center","center":true,"height":36,"width":36,"radius":64}' data-settings-layout="row">
                    {isDaylight ? <Sun size={17} /> : <Moon size={17} />}
                </button>
            )}
        </div>
    </div>
);

export default SettingsSectionHeader;

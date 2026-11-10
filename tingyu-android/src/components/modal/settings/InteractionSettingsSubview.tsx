import { isAndroidNativeRuntime } from '../../../utils/platform';
import React, { useCallback } from 'react';
import { Command, Keyboard, MousePointerClick } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { Theme } from '../../../types';
import { COMMAND_PALETTE_COMMANDS } from '../../command-palette/commandRegistry';
import { getCommandTitle } from '../../command-palette/commandText';
import {
    CUSTOM_SHORTCUT_LETTERS,
    isCustomShortcutLetterAvailable,
    isScopeIndependentCommand,
} from '../../command-palette/customShortcut';
import { CustomSelect } from '../../shared/CustomSelect';
import ShortcutCaptureField from './ShortcutCaptureField';
import { PRIMARY_MODIFIER_LABEL } from '../../../utils/platform';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';
import {
    useInteractionSettingsStore,
    type GridActionButtonSlideTarget,
} from '../../../stores/useInteractionSettingsStore';

// src/components/modal/settings/InteractionSettingsSubview.tsx
// How the listener reaches the command palette: what the grids' action button leads to, whether a
// bare `s` on a grid means "filter" or "commands", and the one shortcut they define themselves.

type InteractionSettingsSubviewProps = {
    isDaylight: boolean;
    settingsCardClass: string;
    theme?: Theme;
};

export const InteractionSettingsSubview: React.FC<InteractionSettingsSubviewProps> = ({
    isDaylight,
    settingsCardClass,
    theme,
}) => {
    const { t } = useTranslation();
    const {
        gridActionButtonSlideTarget,
        gridCommandPaletteHotkey,
        customShortcutLetter,
        customShortcutCommandId,
        setGridActionButtonSlideTarget,
        handleToggleGridCommandPaletteHotkey,
        setCustomShortcutLetter,
        setCustomShortcutCommandId,
    } = useInteractionSettingsStore(useShallow(state => ({
        gridActionButtonSlideTarget: state.gridActionButtonSlideTarget,
        gridCommandPaletteHotkey: state.gridCommandPaletteHotkey,
        customShortcutLetter: state.customShortcutLetter,
        customShortcutCommandId: state.customShortcutCommandId,
        setGridActionButtonSlideTarget: state.setGridActionButtonSlideTarget,
        handleToggleGridCommandPaletteHotkey: state.handleToggleGridCommandPaletteHotkey,
        setCustomShortcutLetter: state.setCustomShortcutLetter,
        setCustomShortcutCommandId: state.setCustomShortcutCommandId,
    })));

    const accentOutlineColor = theme?.secondaryColor || 'rgba(114, 119, 134, 1)';
    const toggleOffBackgroundClass = isDaylight ? 'bg-zinc-300/90' : 'bg-white/10';

    const optionStyle = (selected: boolean) => (
        selected
            ? {
                borderColor: accentOutlineColor,
                boxShadow: `inset 0 0 0 1px ${accentOutlineColor}`,
                backgroundColor: isDaylight ? `${accentOutlineColor}12` : `${accentOutlineColor}18`,
            }
            : { borderColor: isDaylight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)' }
    );

    const renderToggle = (checked: boolean, onChange: () => void, label: string) => (
        <button
            type="button"
            onClick={onChange}
            className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${checked ? '' : toggleOffBackgroundClass}`}
            style={{ backgroundColor: checked ? accentOutlineColor : undefined }}
            role="switch"
            aria-checked={checked}
            aria-label={label}
         data-settings-style='{"width":48,"height":24,"radius":64,"padding":[4,4,4,4]}' data-settings-layout="column" data-settings-swatch={checked ? accentOutlineColor : undefined}>
            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`}  data-settings-style='{"width":16,"height":16,"radius":64}' data-settings-layout="column"/>
        </button>
    );

    const slideOptions: Array<{ value: GridActionButtonSlideTarget; label: string; desc: string }> = [
        {
            value: 'filter',
            label: t('options.gridSlideTargetFilter'),
            desc: t('options.gridSlideTargetFilterDesc'),
        },
        {
            value: 'command-palette',
            label: t('options.gridSlideTargetCommandPalette'),
            desc: t('options.gridSlideTargetCommandPaletteDesc', { modifier: PRIMARY_MODIFIER_LABEL }),
        },
    ];

    // The field records whatever is pressed, so the refusal has to be stated here rather than by
    // leaving a key out of a list. Reads the registry rather than a list kept here, so a hotkey
    // added later starts refusing its own letter on its own.
    const validateShortcutKey = useCallback((letter: string): string | null => {
        if (!CUSTOM_SHORTCUT_LETTERS.includes(letter)) {
            return t('options.customShortcutLettersOnly');
        }
        return isCustomShortcutLetterAvailable(letter, COMMAND_PALETTE_COMMANDS)
            ? null
            : t('options.customShortcutTaken');
    }, [t]);

    // A shortcut fires from anywhere, so only the commands that work anywhere may be bound to one.
    const commandOptions = [
        { value: '', label: t('options.customShortcutNoCommand') },
        ...COMMAND_PALETTE_COMMANDS
            .filter(command => !command.hidden && isScopeIndependentCommand(command))
            .map(command => ({ value: command.id, label: getCommandTitle(command, t) })),
    ];

    if (isAndroidNativeRuntime()) return null;

    return (
        <div className="space-y-5" data-settings-style='{"gap":20}' data-settings-layout="column">
            {!isAndroidNativeRuntime() && <SettingsAnchor anchorId="gridActionButton" label={t('options.gridActionButton')} nativeLayout={{"kind":"column"}}>
                <SettingsSectionHeading icon={MousePointerClick} label={t('options.gridActionButton')} />
                <div className={`p-4 rounded-xl border space-y-4 ${settingsCardClass}`} data-settings-style='{"radius":12,"border":true,"gap":16,"padding":[16,16,16,16]}' data-settings-layout="card">
                    <div className="space-y-1" data-settings-style='{"gap":4}' data-settings-layout="column">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                            {t('options.gridSlideTarget')}
                        </div>
                        <div className="text-[11px] opacity-50 max-w-[360px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                            {t('options.gridSlideTargetDesc')}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2" data-settings-style='{"columns":2,"gap":8}' data-settings-layout="grid">
                        {slideOptions.map(option => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setGridActionButtonSlideTarget(option.value)}
                                className="rounded-xl border px-3 py-3 text-left transition-colors"
                                style={optionStyle(gridActionButtonSlideTarget === option.value)}
                                aria-pressed={gridActionButtonSlideTarget === option.value}
                             data-settings-style='{"radius":12,"border":true,"padding":[12,12,12,12]}' data-settings-layout="column">
                                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                    {option.label}
                                </div>
                                <div className="mt-1 text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted","margin":[0,4,0,0]}' data-settings-layout="column">
                                    {option.desc}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </SettingsAnchor>}

            {!isAndroidNativeRuntime() && <SettingsAnchor anchorId="gridPaletteHotkey" label={t('options.gridPaletteHotkey')} nativeLayout={{"kind":"column"}}>
                <SettingsSectionHeading icon={Command} label={t('options.gridPaletteHotkey')} />
                <div className={`p-4 rounded-xl border ${settingsCardClass}`} data-settings-style='{"radius":12,"border":true,"padding":[16,16,16,16]}' data-settings-layout="card">
                    <div className="flex items-center justify-between gap-4" data-settings-style='{"align":"between","gap":16}' data-settings-layout="row">
                        <div className="space-y-1" data-settings-style='{"gap":4,"grow":true}' data-settings-layout="column">
                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                                {t('options.gridPaletteHotkey')}
                            </div>
                            <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                                {t('options.gridPaletteHotkeyDesc')}
                            </div>
                        </div>
                        {renderToggle(
                            gridCommandPaletteHotkey,
                            () => handleToggleGridCommandPaletteHotkey(!gridCommandPaletteHotkey),
                            t('options.gridPaletteHotkey'),
                        )}
                    </div>
                </div>
            </SettingsAnchor>}

            {!isAndroidNativeRuntime() && <SettingsAnchor anchorId="customShortcut" label={t('options.customShortcut')} nativeLayout={{"kind":"column"}}>
                <SettingsSectionHeading icon={Keyboard} label={t('options.customShortcut')} />
                <div className={`p-4 rounded-xl border space-y-4 ${settingsCardClass}`} data-settings-style='{"radius":12,"border":true,"gap":16,"padding":[16,16,16,16]}' data-settings-layout="card">
                    <div className="space-y-1" data-settings-style='{"gap":4}' data-settings-layout="column">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                            {t('options.customShortcut')}
                        </div>
                        <div className="text-[11px] opacity-50 max-w-[420px]" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="column">
                            {t('options.customShortcutDesc')}
                        </div>
                    </div>
                    {/* One row, two halves of one sentence: this key runs that command. The column
                        captions are gone because the caps and the select already say which is which. */}
                    <div className="grid items-center gap-3 sm:grid-cols-2" data-settings-style='{"align":"center","gap":12}' data-settings-layout="grid">
                        <ShortcutCaptureField
                            value={customShortcutLetter}
                            onChange={setCustomShortcutLetter}
                            validate={validateShortcutKey}
                            label={t('options.customShortcutKey')}
                            isDaylight={isDaylight}
                            theme={theme}
                        />
                        <div className="min-w-0" data-settings-layout="column">
                            <CustomSelect
                                value={customShortcutCommandId ?? ''}
                                onChange={(value) => setCustomShortcutCommandId(value || null)}
                                options={commandOptions}
                                ariaLabel={t('options.customShortcutCommand')}
                                placeholder={t('options.customShortcutNoCommand')}
                                isDaylight={isDaylight}
                                theme={theme}
                            />
                        </div>
                    </div>
                </div>
            </SettingsAnchor>}
        </div>
    );
};

export default InteractionSettingsSubview;

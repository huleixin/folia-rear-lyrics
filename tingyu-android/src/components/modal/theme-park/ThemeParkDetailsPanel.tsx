import React from 'react';
import { useTranslation } from 'react-i18next';
import type { DualTheme } from '../../../types';
import {
    isThemeNameValid,
    THEME_DESCRIPTION_MAX_LENGTH,
    THEME_NAME_MAX_LENGTH,
    type EditableMode,
} from './themeParkDraft';

// src/components/modal/theme-park/ThemeParkDetailsPanel.tsx
// Details tab: the per-mode name and atmosphere description that the quick editor could only
// partly reach (name) and that nothing could edit before (description).

type ThemeParkDetailsPanelProps = {
    draft: DualTheme;
    onFieldChange: (mode: EditableMode, patch: { name?: string; description?: string; }) => void;
};

const MODES: EditableMode[] = ['light', 'dark'];

const ThemeParkDetailsPanel: React.FC<ThemeParkDetailsPanelProps> = ({ draft, onFieldChange }) => {
    const { t } = useTranslation();

    return (
        <div className="space-y-4" data-settings-style='{"gap":16}' data-settings-layout="column">
            {MODES.map(mode => {
                const theme = draft[mode];
                const name = theme.name ?? '';
                const description = theme.description ?? '';
                const nameInvalid = !isThemeNameValid(name);

                return (
                    <div key={mode} className="space-y-3 rounded-[24px] border border-white/10 p-4" data-settings-style='{"gap":12,"radius":24,"border":true,"padding":[16,16,16,16]}' data-settings-layout="card">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                            {t(mode === 'light' ? 'options.lightTheme' : 'options.darkTheme')}
                        </div>

                        <label className="block space-y-2" data-settings-style='{"gap":8}' data-settings-layout="column">
                            <div className="flex items-center justify-between" data-settings-style='{"align":"between"}' data-settings-layout="row">
                                <span className="text-xs font-medium uppercase tracking-[0.22em] opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"weight":500,"tone":"muted","grow":true}' data-settings-layout="wrap">
                                    {t('options.themeName')}
                                </span>
                                <span className="text-[11px] font-mono opacity-50" style={{ color: nameInvalid ? '#f87171' : 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="wrap">
                                    {name.trim().length}/{THEME_NAME_MAX_LENGTH}
                                </span>
                            </div>
                            <input
                                type="text"
                                value={name}
                                onChange={(event) => onFieldChange(mode, { name: event.target.value })}
                                maxLength={THEME_NAME_MAX_LENGTH}
                                className="w-full rounded-2xl border bg-white/5 px-4 py-3 text-sm outline-none transition-colors focus:border-white/20"
                                style={{ color: 'var(--text-primary)', borderColor: nameInvalid ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.1)' }}
                                spellCheck={false}
                             data-settings-style='{"radius":16,"border":true,"fill":true,"font":14,"padding":[16,12,16,12],"tone":"text"}' data-settings-layout="column"/>
                        </label>

                        <label className="block space-y-2" data-settings-style='{"gap":8}' data-settings-layout="column">
                            <div className="flex items-center justify-between" data-settings-style='{"align":"between"}' data-settings-layout="row">
                                <span className="text-xs font-medium uppercase tracking-[0.22em] opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"weight":500,"tone":"muted","grow":true}' data-settings-layout="wrap">
                                    {t('theme.themeDescription')}
                                </span>
                                <span className="text-[11px] font-mono opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="wrap">
                                    {description.length}/{THEME_DESCRIPTION_MAX_LENGTH}
                                </span>
                            </div>
                            <textarea
                                value={description}
                                onChange={(event) => onFieldChange(mode, { description: event.target.value })}
                                maxLength={THEME_DESCRIPTION_MAX_LENGTH}
                                rows={3}
                                placeholder={t('theme.themeDescriptionPlaceholder')}
                                className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition-colors focus:border-white/20"
                                style={{ color: 'var(--text-primary)' }}
                             data-settings-style='{"radius":16,"border":true,"fill":true,"font":14,"padding":[16,12,16,12],"tone":"text","minHeight":81}' data-settings-layout="column"/>
                        </label>
                    </div>
                );
            })}

            <div className="text-xs leading-relaxed opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="column">
                {t('theme.themeDescriptionHint')}
            </div>
        </div>
    );
};

export default ThemeParkDetailsPanel;

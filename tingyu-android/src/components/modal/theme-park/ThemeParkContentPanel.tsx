import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLucideIcons } from '../../../hooks/useLucideIcons';
import { hasLucideIcon, resolveLucideIcon } from '../../../services/lucideIconResolver';
import { LYRICS_ICON_LIMIT, WORD_COLOR_LIMIT, type WordColorEntry } from './themeParkDraft';

// src/components/modal/theme-park/ThemeParkContentPanel.tsx
// Content tab: the emotion word colors and the lucide lyric icons an AI theme carries. Both
// describe the song rather than the light/dark surface, so edits here apply to both sides.

type ThemeParkContentPanelProps = {
    wordColors: WordColorEntry[];
    lyricsIcons: string[];
    accentColor: string;
    onWordColorsChange: (next: WordColorEntry[]) => void;
    onLyricsIconsChange: (next: string[]) => void;
};

const ThemeParkContentPanel: React.FC<ThemeParkContentPanelProps> = ({
    wordColors,
    lyricsIcons,
    accentColor,
    onWordColorsChange,
    onLyricsIconsChange,
}) => {
    const { t } = useTranslation();
    const [iconDraft, setIconDraft] = useState('');
    const [iconError, setIconError] = useState<string | null>(null);
    // The icon chips read loaded icons; this re-renders them as their chunks arrive.
    useLucideIcons(lyricsIcons);

    const updateWordColor = (index: number, patch: Partial<WordColorEntry>) => {
        onWordColorsChange(wordColors.map((entry, entryIndex) => (
            entryIndex === index ? { ...entry, ...patch } : entry
        )));
    };

    const handleAddIcon = async () => {
        const name = iconDraft.trim();
        if (!name) {
            return;
        }
        if (!(await hasLucideIcon(name))) {
            setIconError(t('theme.lyricsIconUnknown'));
            return;
        }
        if (lyricsIcons.includes(name)) {
            setIconDraft('');
            return;
        }

        onLyricsIconsChange([...lyricsIcons, name]);
        setIconDraft('');
        setIconError(null);
    };

    return (
        <div className="space-y-4" data-settings-style='{"gap":16}' data-settings-layout="column">
            <div className="space-y-3 rounded-[24px] border border-white/10 p-4" data-settings-style='{"gap":12,"radius":24,"border":true,"padding":[16,16,16,16]}' data-settings-layout="card">
                <div className="flex items-center justify-between gap-2" data-settings-style='{"align":"between","gap":8}' data-settings-layout="row">
                    <div className="min-w-0" data-settings-style='{"grow":true}' data-settings-layout="column">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                            {t('theme.wordColors')}
                        </div>
                        <div className="mt-1 text-xs opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted","margin":[0,4,0,0]}' data-settings-layout="column">
                            {t('theme.wordColorsDesc')}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => onWordColorsChange([...wordColors, { word: '', color: accentColor }])}
                        disabled={wordColors.length >= WORD_COLOR_LIMIT}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ color: 'var(--text-primary)' }}
                     data-settings-style='{"align":"center","gap":6,"radius":64,"border":true,"fill":true,"font":12,"padding":[12,8,12,8],"tone":"text"}' data-settings-layout="row">
                        <Plus size={13} />
                        <span data-settings-layout="wrap">{t('theme.addWordColor')}</span>
                    </button>
                </div>

                {wordColors.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-xs opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"radius":16,"border":true,"center":true,"font":12,"tone":"muted","padding":[16,24,16,24]}' data-settings-layout="card">
                        {t('theme.wordColorsEmpty')}
                    </div>
                ) : (
                    <div className="space-y-2" data-settings-style='{"gap":8}' data-settings-layout="column">
                        {wordColors.map((entry, index) => (
                            <div key={`word-color-${index}`} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-2" data-settings-style='{"align":"center","gap":8,"radius":16,"border":true,"fill":true,"padding":[8,8,8,8]}' data-settings-layout="row">
                                <input
                                    type="color"
                                    value={entry.color}
                                    onChange={(event) => updateWordColor(index, { color: event.target.value })}
                                    className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0"
                                    aria-label={t('theme.wordColorSwatch')}
                                 data-settings-style='{"height":36,"width":36,"radius":8,"border":true,"padding":[0,0,0,0]}' data-settings-layout="column"/>
                                <input
                                    type="text"
                                    value={entry.word}
                                    onChange={(event) => updateWordColor(index, { word: event.target.value })}
                                    placeholder={t('theme.wordColorWordPlaceholder')}
                                    className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1.5 text-sm outline-none"
                                    style={{ color: 'var(--text-primary)' }}
                                    spellCheck={false}
                                 data-settings-style='{"grow":true,"radius":8,"font":14,"padding":[8,6,8,6],"tone":"text"}' data-settings-layout="column"/>
                                <span className="shrink-0 font-mono text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":11,"tone":"muted"}' data-settings-layout="wrap">
                                    {entry.color.toUpperCase()}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => onWordColorsChange(wordColors.filter((_, entryIndex) => entryIndex !== index))}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
                                    style={{ color: 'var(--text-secondary)' }}
                                    aria-label={t('theme.removeEntry')}
                                 data-settings-style='{"align":"center","center":true,"height":32,"width":32,"radius":8,"tone":"muted"}' data-settings-layout="row">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="space-y-3 rounded-[24px] border border-white/10 p-4" data-settings-style='{"gap":12,"radius":24,"border":true,"padding":[16,16,16,16]}' data-settings-layout="card">
                <div className="min-w-0" data-settings-layout="column">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }} data-settings-style='{"font":14,"weight":500,"tone":"text"}' data-settings-layout="column">
                        {t('theme.lyricsIcons')}
                    </div>
                    <div className="mt-1 text-xs opacity-50" style={{ color: 'var(--text-secondary)' }} data-settings-style='{"font":12,"tone":"muted","margin":[0,4,0,0]}' data-settings-layout="column">
                        {t('theme.lyricsIconsDesc')}
                    </div>
                </div>

                {lyricsIcons.length > 0 && (
                    <div className="flex flex-wrap gap-2" data-settings-style='{"gap":8}' data-settings-layout="wrap">
                        {lyricsIcons.map(iconName => {
                            const Icon = resolveLucideIcon(iconName);

                            return (
                                <span
                                    key={iconName}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-1 pl-2.5 pr-1.5 text-xs"
                                    style={{ color: 'var(--text-primary)' }}
                                 data-settings-style='{"align":"center","gap":6,"radius":64,"border":true,"fill":true,"font":12,"padding":[10,4,6,4],"tone":"text"}' data-settings-layout="row">
                                    {Icon ? <Icon size={13} /> : null}
                                    <span data-settings-layout="wrap">{iconName}</span>
                                    <button
                                        type="button"
                                        onClick={() => onLyricsIconsChange(lyricsIcons.filter(name => name !== iconName))}
                                        className="flex h-5 w-5 items-center justify-center rounded-full transition-colors hover:bg-white/15"
                                        aria-label={t('theme.removeEntry')}
                                     data-settings-style='{"align":"center","center":true,"height":20,"width":20,"radius":64}' data-settings-layout="row">
                                        <Trash2 size={11} />
                                    </button>
                                </span>
                            );
                        })}
                    </div>
                )}

                <div className="flex items-center gap-2" data-settings-style='{"align":"center","gap":8}' data-settings-layout="row">
                    <input
                        type="text"
                        value={iconDraft}
                        onChange={(event) => {
                            setIconDraft(event.target.value);
                            setIconError(null);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void handleAddIcon();
                            }
                        }}
                        placeholder={t('theme.lyricsIconPlaceholder')}
                        disabled={lyricsIcons.length >= LYRICS_ICON_LIMIT}
                        className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition-colors focus:border-white/20 disabled:opacity-40"
                        style={{ color: 'var(--text-primary)' }}
                        spellCheck={false}
                     data-settings-style='{"grow":true,"radius":16,"border":true,"fill":true,"font":14,"padding":[16,10,16,10],"tone":"text"}' data-settings-layout="column"/>
                    <button
                        type="button"
                        onClick={() => void handleAddIcon()}
                        disabled={lyricsIcons.length >= LYRICS_ICON_LIMIT}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2.5 text-xs transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ color: 'var(--text-primary)' }}
                     data-settings-style='{"align":"center","gap":6,"radius":64,"border":true,"fill":true,"font":12,"padding":[12,10,12,10],"tone":"text"}' data-settings-layout="row">
                        <Plus size={13} />
                        <span data-settings-layout="wrap">{t('theme.addLyricsIcon')}</span>
                    </button>
                </div>

                {iconError && (
                    <div className="text-xs" style={{ color: '#f87171' }} data-settings-style='{"font":12}' data-settings-layout="column">{iconError}</div>
                )}
            </div>
        </div>
    );
};

export default ThemeParkContentPanel;

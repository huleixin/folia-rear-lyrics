import React from 'react';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import { useTranslation } from 'react-i18next';
import { useVisualizerSettingsStore } from '../../../stores/useVisualizerSettingsStore';
import { VISUALIZER_REGISTRY, getVisualizerModeLabel } from '../../visualizer/registry';

// src/components/modal/settings/MobileRandomVisualizerSettings.tsx
export default function MobileRandomVisualizerSettings() {
    const { t } = useTranslation();
    const enabled = useVisualizerSettingsStore(state => state.randomVisualizerModePerSong);
    const pool = useVisualizerSettingsStore(state => state.randomVisualizerModes);
    const actions = useVisualizerSettingsStore.getState();
    return <SettingsAnchor anchorId="randomStyleRange" label={t('options.randomStyleRange')} className="space-y-3 rounded-xl border border-white/10 p-4">
        <label className="flex items-center justify-between gap-4 text-sm font-medium">
            {t('options.randomStylePerSong')}
            <input type="checkbox" checked={enabled} className="h-5 w-5 accent-emerald-300"
                onChange={event => actions.handleToggleRandomVisualizerModePerSong(event.target.checked)} />
        </label>
        <p className="text-xs opacity-55">{t('options.randomStyleRangeHint')}</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('options.randomStyleRange')}>
            {VISUALIZER_REGISTRY.map(entry => {
                const checked = pool.includes(entry.mode);
                return <label key={entry.mode} className="flex min-w-0 items-center gap-2 rounded-lg bg-white/5 px-2 py-2 text-xs">
                    <input type="checkbox" className="h-4 w-4 shrink-0 accent-emerald-300" checked={checked}
                        disabled={checked && pool.length === 1}
                        onChange={() => actions.handleSetRandomVisualizerModes(checked ? pool.filter(mode => mode !== entry.mode) : [...pool, entry.mode])} />
                    <span className="truncate">{getVisualizerModeLabel(entry.mode, t)}</span>
                </label>;
            })}
        </div>
    </SettingsAnchor>;
}

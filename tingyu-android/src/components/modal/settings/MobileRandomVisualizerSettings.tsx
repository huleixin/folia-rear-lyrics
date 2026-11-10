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
    return <SettingsAnchor anchorId="randomStyleRange" label={t('options.randomStyleRange')} className="space-y-3 rounded-xl border border-white/10 p-4" nativeLayout={{"kind":"card","gap":12,"radius":12,"border":true,"padding":[16,16,16,16]}}>
        <label className="flex items-center justify-between gap-4 text-sm font-medium" data-settings-style='{"align":"between","gap":16,"font":14,"weight":500}' data-settings-layout="row">
            {t('options.randomStylePerSong')}
            <input type="checkbox" checked={enabled} className="h-5 w-5 accent-emerald-300"
                onChange={event => actions.handleToggleRandomVisualizerModePerSong(event.target.checked)}  data-settings-style='{"height":20,"width":20}' data-settings-layout="column"/>
        </label>
        <p className="text-xs opacity-55" data-settings-style='{"font":12,"tone":"muted"}' data-settings-layout="wrap">{t('options.randomStyleRangeHint')}</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('options.randomStyleRange')} data-settings-style='{"columns":2,"gap":8}' data-settings-layout="grid">
            {VISUALIZER_REGISTRY.map(entry => {
                const checked = pool.includes(entry.mode);
                return <label key={entry.mode} className="flex min-w-0 items-center gap-2 rounded-lg bg-white/5 px-2 py-2 text-xs" data-settings-style='{"align":"center","gap":8,"radius":8,"fill":true,"font":12,"padding":[8,8,8,8]}' data-settings-layout="row">
                    <input type="checkbox" className="h-4 w-4 shrink-0 accent-emerald-300" checked={checked}
                        disabled={checked && pool.length === 1}
                        onChange={() => actions.handleSetRandomVisualizerModes(checked ? pool.filter(mode => mode !== entry.mode) : [...pool, entry.mode])}  data-settings-style='{"height":16,"width":16}' data-settings-layout="column"/>
                    <span className="truncate" data-settings-layout="wrap">{getVisualizerModeLabel(entry.mode, t)}</span>
                </label>;
            })}
        </div>
    </SettingsAnchor>;
}

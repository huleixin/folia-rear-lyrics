import React from 'react';
import { useTranslation } from 'react-i18next';
import { useVisualizerSettingsStore } from '../../stores/useVisualizerSettingsStore';
import { LYRIC_RENDER_SCALES } from '../../utils/lyricRenderQuality';
import type { LyricRenderOverride } from '../../types';
import SettingsRow from '../modal/settings/SettingsRow';

// A mode editor and the graphics page edit the same persisted quality override.
export function StageModeQualityRow({ mode, antialias = false }: { mode: string; antialias?: boolean }) {
    const { t } = useTranslation();
    const settings = useVisualizerSettingsStore(state => state.stageRenderSettings);
    const override = settings.modes[mode] ?? { scale: 'global', antialias: 'global' };
    return <><SettingsRow title={t('stageQuality.resolution')} dividerClass="border-current/10" control={
        <select aria-label={t('stageQuality.resolution')} value={override.scale} className="rounded-xl bg-transparent p-2"
            onChange={event => useVisualizerSettingsStore.getState().handleSetStageRenderSettings({ ...settings, modes: {
                ...settings.modes, [mode]: { ...override, scale: event.target.value === 'global' ? 'global' : Number(event.target.value) as LyricRenderOverride['scale'] },
            } })}>
            <option value="global">{t('stageQuality.follow')}</option>
            {LYRIC_RENDER_SCALES.map(scale => <option key={scale} value={scale}>{scale}×</option>)}
        </select>}/>{antialias && <SettingsRow title={t('stageQuality.antialias')} dividerClass="border-current/10" control={
            <select aria-label={t('stageQuality.antialias')} value={override.antialias} onChange={event => useVisualizerSettingsStore.getState().handleSetStageRenderSettings({...settings,modes:{...settings.modes,[mode]:{...override,antialias:event.target.value as LyricRenderOverride['antialias']}}})}>
                {(['global','on','off'] as const).map(value => <option key={value} value={value}>{t(value === 'global' ? 'stageQuality.follow' : 'stageQuality.'+value)}</option>)}
            </select>}/> }</>;

}

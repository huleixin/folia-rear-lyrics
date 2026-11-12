import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LyricRenderOverride, StageQualityPreset } from '../../../types/lyricRenderQuality';
import { useVisualizerSettingsStore } from '../../../stores/useVisualizerSettingsStore';
import { VISUALIZER_REGISTRY, getVisualizerModeLabel } from '../../visualizer/registry';
import { LYRIC_RENDER_SCALES } from '../../../utils/lyricRenderQuality';
import SettingsRow from './SettingsRow';

// Existing semantic rows are projected into Compose; no second graphics page or settings kit.
const CANVAS_MODES = new Set(['sonnet', 'tempera', 'hanabi', 'lumiere', 'diorama', 'fume', 'monet', 'pendolo', 'nebbia']);
export default function StageQualitySettings({ dividerClass }: { dividerClass: string }) {
    const { t } = useTranslation();
    const settings = useVisualizerSettingsStore(state => state.stageRenderSettings);
    const setSettings = useVisualizerSettingsStore(state => state.handleSetStageRenderSettings);
    const [mode, setMode] = useState('global');
    const global = mode === 'global';
    const override = settings.modes[mode] ?? { scale: 'global', antialias: 'global' };
    const quality = global ? settings.quality : override;
    const change = (patch: Partial<LyricRenderOverride>) => setSettings(global
        ? { ...settings, preset: 'custom', quality: { ...settings.quality, ...patch } }
        : { ...settings, modes: { ...settings.modes, [mode]: { ...override, ...patch } } });
    const selectClass = 'max-w-[160px] rounded-lg border border-current/15 bg-transparent px-2 py-1 text-sm';
    return <>
        <SettingsRow title={t('stageQuality.preset')} description={t('stageQuality.description')} dividerClass={dividerClass} control={
            <select aria-label={t('stageQuality.preset')} className={selectClass} value={settings.preset} onChange={event => setSettings({ ...settings, preset: event.target.value as StageQualityPreset })}>
                {['auto', 'high', 'battery', 'custom'].map(value => <option key={value} value={value}>{t(`stageQuality.${value}`)}</option>)}
            </select>} />
        <SettingsRow title={t('stageQuality.scope')} dividerClass={dividerClass} control={
            <select aria-label={t('stageQuality.scope')} className={selectClass} value={mode} onChange={event => setMode(event.target.value)}>
                <option value="global">{t('stageQuality.global')}</option>
                {VISUALIZER_REGISTRY.filter(entry => CANVAS_MODES.has(entry.mode)).map(entry => <option key={entry.mode} value={entry.mode}>{getVisualizerModeLabel(entry.mode, t)}</option>)}
            </select>} />
        <SettingsRow title={t('stageQuality.resolution')} dividerClass={dividerClass} control={
            <select aria-label={t('stageQuality.resolution')} className={selectClass} value={quality.scale} onChange={event => change({ scale: event.target.value === 'global' ? 'global' : Number(event.target.value) as LyricRenderOverride['scale'] })}>
                {!global && <option value="global">{t('stageQuality.follow')}</option>}
                {LYRIC_RENDER_SCALES.map(value => <option key={value} value={value}>{value}×</option>)}
            </select>} />
        {mode !== 'nebbia' && <SettingsRow title={t('stageQuality.antialias')} description={t('stageQuality.aaHint')} dividerClass={dividerClass} control={
            <select aria-label={t('stageQuality.antialias')} className={selectClass} value={quality.antialias} onChange={event => global
                ? setSettings({ ...settings, preset: 'custom', quality: { ...settings.quality, antialias: event.target.value } })
                : change({ antialias: event.target.value as LyricRenderOverride['antialias'] })}>
                <option value={global ? 'auto' : 'global'}>{t(global ? 'stageQuality.auto' : 'stageQuality.follow')}</option>
                <option value="on">{t('stageQuality.on')}</option><option value="off">{t('stageQuality.off')}</option>
            </select>} />}
    </>;
}

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVisualizerSettingsStore } from '../../../stores/useVisualizerSettingsStore';
import { Group, Row, Segmented, Select, type SettingsGroupDef } from '../StagePanelControls';
import { StageModeQualityRow } from '../StageModeQualityRow';
import type { VisualizerSettingsPanelProps } from '../definition';
import { percent, SliderRow, times, ToggleRow } from '../StagePanelControls';
import {
    apertureReadout,
    MACHI_APERTURE_TRACK_MAX,
    MACHI_CAMERA_LABEL_KEYS,
    MACHI_FOCUS_LABEL_KEYS,
    MACHI_VIEW_SLIDERS,
    machiApertureFromTrack,
    machiApertureToTrack,
    signedReadout,
} from './cameraControls';
import { getMachiDegrade, subscribeMachiDegrade } from './degradeStatus';
import { resolveMachiQualityPreset } from './machiTuning';
import { getMachiShownScene, subscribeMachiShownScene } from './shownScene';
import {
    DEFAULT_MACHI_TUNING,
    DEFAULT_MACHI_VIEW,
    MACHI_ANTIALIAS_MODES,
    MACHI_CAMERA_MODES,
    MACHI_DETAIL_LEVELS,
    MACHI_DOF_LIMITS,
    MACHI_FOCUS_MODES,
    MACHI_FOLLOW_GLOBAL,
    MACHI_MOTION_SPEED_LIMITS,
    MACHI_QUALITY_PRESET_IDS,
    MACHI_QUALITY_PRESETS,
    MACHI_RENDER_SCALES,
    MACHI_SCENE_IDS,
    MACHI_TIMES_OF_DAY,
    MACHI_VIEW_LIMITS,
    MACHI_WEATHERS,
    type MachiAntialias,
    type MachiCameraMode,
    type MachiCameraView,
    type MachiDetailLevel,
    type MachiFocusMode,
    type MachiQuality,
    type MachiQualityPresetId,
    type MachiSceneId,
    type MachiTimeOfDay,
    type MachiTuning,
    type MachiWeather,
} from './types';

// src/components/visualizer/machi/MachiSettingsPanel.tsx
// 町景的设置面板：场景（线稿小图，不放实时预览）、时间、天气三项，每项都有“自动”；灯光（模拟节拍：没开智能动感模式时
// 霓虹随拍、大屏闪拍按固定节拍走）；镜头（默认视角，或自定义视角
// 与它的五个滑块，每个场景各一份：场景“自动”时多一排选调哪个场景的，默认是正在画的那个；运镜开关与快慢）；景深（光圈、强度、清晰范围、移轴、对焦在哪）；画质（高 / 平衡 / 低三套预设和各个细项，细项和哪套都对不上
// 就多出一个选中的“自定义”，预设不单独存；分辨率、抗锯齿可以跟随「动画与性能」里的全局挡位；自动降级正在压着时写出压了几格）。快捷控件里的胶囊和播放页的取景控制条用同一套文案（cameraControls.ts）。

const SCENE_GROUP: SettingsGroupDef = { id: 'vis-machi-scene', titleKey: 'options.machiSceneSection' };
const SKY_GROUP: SettingsGroupDef = { id: 'vis-machi-sky', titleKey: 'options.machiSkySection' };
const CAMERA_GROUP: SettingsGroupDef = { id: 'vis-machi-camera', titleKey: 'options.machiCameraSection' };
const DOF_GROUP: SettingsGroupDef = { id: 'vis-machi-dof', titleKey: 'options.machiDofSection' };
const LIGHTS_GROUP: SettingsGroupDef = { id: 'vis-machi-lights', titleKey: 'options.machiLightsSection' };
const QUALITY_GROUP: SettingsGroupDef = { id: 'vis-machi-quality', titleKey: 'options.machiQualitySection' };

const QUALITY_PRESET_LABEL_KEYS: Record<MachiQualityPresetId, string> = {
    high: 'options.machiQualityHigh',
    balanced: 'options.machiQualityBalanced',
    low: 'options.machiQualityLow',
};

const ANTIALIAS_LABEL_KEYS: Record<MachiAntialias, string> = {
    off: 'options.machiAntialiasOff',
    fxaa: 'options.machiAntialiasFxaa',
    smaa: 'options.machiAntialiasSmaa',
    ssaa: 'options.machiAntialiasSsaa',
};

const LEVEL_LABEL_KEYS: Record<MachiDetailLevel, string> = {
    off: 'options.machiLevelOff',
    low: 'options.machiLevelLow',
    high: 'options.machiLevelHigh',
};

export const MACHI_SCENE_CHOICES: MachiTuning['scene'][] = ['auto', ...MACHI_SCENE_IDS];

export const MACHI_SCENE_LABEL_KEYS: Record<MachiTuning['scene'], string> = {
    auto: 'options.machiSceneAuto',
    konbini: 'options.machiSceneKonbini',
    station: 'options.machiSceneStation',
    kowloon: 'options.machiSceneKowloon',
};

export const MACHI_TIME_LABEL_KEYS: Record<MachiTimeOfDay, string> = {
    auto: 'options.machiTimeAuto',
    day: 'options.machiTimeDay',
    dusk: 'options.machiTimeDusk',
    night: 'options.machiTimeNight',
};

export const MACHI_WEATHER_LABEL_KEYS: Record<MachiWeather, string> = {
    auto: 'options.machiWeatherAuto',
    clear: 'options.machiWeatherClear',
    rain: 'options.machiWeatherRain',
    snow: 'options.machiWeatherSnow',
    fog: 'options.machiWeatherFog',
};

const MachiSettingsPanel: React.FC<VisualizerSettingsPanelProps & { tuning: MachiTuning; onTuningChange: (patch: Partial<MachiTuning>) => void }> = ({
    t,
    tuning = DEFAULT_MACHI_TUNING,
    onTuningChange,
    onSliderPointerDown,
    onSliderCommit,
    readOnlyExternalTunings,
}) => {
    const custom = tuning.camera === 'custom';
    // 滑块调哪个场景的视角：选定了场景就是它；“自动”时默认是正在画的那个，也可以自己挑。
    const shownScene = React.useSyncExternalStore(subscribeMachiShownScene, getMachiShownScene, getMachiShownScene);
    const [pickedScene, setPickedScene] = React.useState<MachiSceneId | null>(null);
    const viewScene = tuning.scene !== 'auto' ? tuning.scene : pickedScene ?? shownScene ?? MACHI_SCENE_IDS[0];
    const view = tuning.views[viewScene];
    const setView = (next: MachiCameraView) => onTuningChange?.({ views: { ...tuning.views, [viewScene]: next } });
    const quality = tuning.quality;
    const preset = resolveMachiQualityPreset(quality);
    const setQuality = (patch: Partial<MachiQuality>) => onTuningChange?.({ quality: { ...quality, ...patch } });
    const levels = MACHI_DETAIL_LEVELS.map(level => ({ value: level, label: t(LEVEL_LABEL_KEYS[level]) }));
    const degraded = React.useSyncExternalStore(subscribeMachiDegrade, getMachiDegrade, getMachiDegrade);
    // 面板拿到的 t 不带插值参数：带全局挡位当前值的说明用 i18next 自己的。
    const { t: format } = useTranslation();
    return (
        <>
            <Group def={SCENE_GROUP}>
                <Row label={t('options.machiScene')} note={t('options.machiSceneHint')}>
                    <Segmented value={tuning.scene} options={MACHI_SCENE_CHOICES.map(scene => ({value: scene, label: t(MACHI_SCENE_LABEL_KEYS[scene])}))} onChange={scene => onTuningChange({scene})}/>
                </Row>
            </Group>

            <Group def={SKY_GROUP}>
                <Row label={t('options.machiTimeOfDay')} note={t('options.machiTimeOfDayHint')}>
                    <Segmented<MachiTimeOfDay>
                        value={tuning.timeOfDay}
                        options={MACHI_TIMES_OF_DAY.map(time => ({ value: time, label: t(MACHI_TIME_LABEL_KEYS[time]) }))}
                        onChange={timeOfDay => onTuningChange?.({ timeOfDay })}
                    />
                </Row>
                <Row label={t('options.machiWeather')} note={t('options.machiWeatherHint')}>
                    <Segmented<MachiWeather>
                        value={tuning.weather}
                        options={MACHI_WEATHERS.map(weather => ({ value: weather, label: t(MACHI_WEATHER_LABEL_KEYS[weather]) }))}
                        onChange={weather => onTuningChange?.({ weather })}
                    />
                </Row>
            </Group>

            <Group def={LIGHTS_GROUP}>
                <ToggleRow label={t('stageQuality.bandMotion')} note={t('stageQuality.bandMotionHint')} checked={tuning.bandMotion} onChange={bandMotion => onTuningChange({bandMotion})}/>
                <SliderRow label={t('stageQuality.motionStrength')} value={tuning.motionStrength} min={0} max={2} step={.05} format={times} onChange={motionStrength => onTuningChange({motionStrength})} onDragStart={onSliderPointerDown} onDragEnd={onSliderCommit}/>

                <ToggleRow
                    label={t('options.machiSimulatedBeat')}
                    note={t('options.machiSimulatedBeatHint')}
                    checked={tuning.simulatedBeat}
                    onChange={simulatedBeat => onTuningChange?.({ simulatedBeat })}
                />
            </Group>

            <Group def={CAMERA_GROUP}>
                {custom && <button type="button" className="m-4 rounded-xl border px-3 py-2" onClick={() => setView(DEFAULT_MACHI_VIEW)}>{t('options.machiViewReset')}</button>}
                <Row label={t('options.machiCameraMode')} note={t('options.machiCameraModeHint')}>
                    <Segmented<MachiCameraMode>
                        value={tuning.camera}
                        options={MACHI_CAMERA_MODES.map(mode => ({ value: mode, label: t(MACHI_CAMERA_LABEL_KEYS[mode]) }))}
                        onChange={camera => onTuningChange?.({ camera })}
                    />
                </Row>
                {custom && tuning.scene === 'auto' && (
                    <Row label={t('options.machiViewScene')} note={t('options.machiViewSceneHint')}>
                        <Segmented<MachiSceneId>
                            value={viewScene}
                            options={MACHI_SCENE_IDS.map(scene => ({ value: scene, label: t(MACHI_SCENE_LABEL_KEYS[scene]) }))}
                            onChange={setPickedScene}
                        />
                    </Row>
                )}
                {custom && MACHI_VIEW_SLIDERS.map(slider => (
                    <SliderRow
                        key={slider.key}
                        label={t(slider.labelKey)}
                        value={view[slider.key]}
                        min={MACHI_VIEW_LIMITS[slider.key].min}
                        max={MACHI_VIEW_LIMITS[slider.key].max}
                        step={slider.step}
                        format={slider.format}
                        onChange={value => setView({ ...view, [slider.key]: value })}
                        onDragStart={onSliderPointerDown}
                        onDragEnd={onSliderCommit}
                    />
                ))}
                <ToggleRow
                    label={t('options.machiCameraMotion')}
                    note={t('options.machiCameraMotionHint')}
                    checked={tuning.motion}
                    onChange={motion => onTuningChange?.({ motion })}
                />
                <SliderRow
                    label={t('options.machiCameraMotionSpeed')}
                    value={tuning.motionSpeed}
                    min={MACHI_MOTION_SPEED_LIMITS.min}
                    max={MACHI_MOTION_SPEED_LIMITS.max}
                    step={0.05}
                    format={times}
                    disabled={!tuning.motion}
                    onChange={motionSpeed => onTuningChange?.({ motionSpeed })}
                    onDragStart={onSliderPointerDown}
                    onDragEnd={onSliderCommit}
                />
            </Group>

            <Group def={DOF_GROUP}>
                {/* 光圈按档走（往右光圈越大），存的是 f 值。 */}
                <SliderRow
                    label={t('options.machiAperture')}
                    note={t('options.machiApertureHint')}
                    value={machiApertureToTrack(tuning.aperture)}
                    min={0}
                    max={MACHI_APERTURE_TRACK_MAX}
                    step={1}
                    format={index => apertureReadout(machiApertureFromTrack(index))}
                    disabled={tuning.dof === 0}
                    onChange={index => onTuningChange?.({ aperture: machiApertureFromTrack(index) })}
                    onDragStart={onSliderPointerDown}
                    onDragEnd={onSliderCommit}
                />
                <SliderRow
                    label={t('options.machiDof')}
                    note={t('options.machiDofHint')}
                    value={tuning.dof}
                    min={MACHI_DOF_LIMITS.dof.min}
                    max={MACHI_DOF_LIMITS.dof.max}
                    step={0.05}
                    format={percent}
                    onChange={dof => onTuningChange?.({ dof })}
                    onDragStart={onSliderPointerDown}
                    onDragEnd={onSliderCommit}
                />
                <SliderRow
                    label={t('options.machiDofRange')}
                    value={tuning.dofRange}
                    min={MACHI_DOF_LIMITS.dofRange.min}
                    max={MACHI_DOF_LIMITS.dofRange.max}
                    step={0.05}
                    format={times}
                    disabled={tuning.dof === 0}
                    onChange={dofRange => onTuningChange?.({ dofRange })}
                    onDragStart={onSliderPointerDown}
                    onDragEnd={onSliderCommit}
                />
                <SliderRow
                    label={t('options.machiTiltShift')}
                    note={t('options.machiTiltShiftHint')}
                    value={tuning.tiltShift}
                    min={MACHI_DOF_LIMITS.tiltShift.min}
                    max={MACHI_DOF_LIMITS.tiltShift.max}
                    step={0.05}
                    format={percent}
                    onChange={tiltShift => onTuningChange?.({ tiltShift })}
                    onDragStart={onSliderPointerDown}
                    onDragEnd={onSliderCommit}
                />
                <Row label={t('options.machiFocus')} note={t('options.machiFocusHint')}>
                    <Segmented<MachiFocusMode>
                        value={tuning.focus}
                        options={MACHI_FOCUS_MODES.map(focus => ({ value: focus, label: t(MACHI_FOCUS_LABEL_KEYS[focus]) }))}
                        onChange={focus => onTuningChange?.({ focus })}
                    />
                </Row>
                {tuning.focus === 'manual' && (
                    <SliderRow
                        label={t('options.machiFocusOffset')}
                        value={tuning.focusOffset}
                        min={MACHI_DOF_LIMITS.focusOffset.min}
                        max={MACHI_DOF_LIMITS.focusOffset.max}
                        step={0.1}
                        format={signedReadout(' m', 1)}
                        onChange={focusOffset => onTuningChange?.({ focusOffset })}
                        onDragStart={onSliderPointerDown}
                        onDragEnd={onSliderCommit}
                    />
                )}
            </Group>

            <Group def={QUALITY_GROUP}>
                <Row label={t('options.machiQuality')} note={t('options.machiQualityHint')}>
                    {/* “自定义”只在细项和哪档都对不上时出现（选中的那一项，点它没有动作）。 */}
                    <Segmented<MachiQualityPresetId | 'custom'>
                        value={preset}
                        options={[
                            ...MACHI_QUALITY_PRESET_IDS.map(id => ({ value: id, label: t(QUALITY_PRESET_LABEL_KEYS[id]) })),
                            ...(preset === 'custom' ? [{ value: 'custom' as const, label: t('options.machiQualityCustom') }] : []),
                        ]}
                        onChange={id => { if (id !== 'custom') setQuality(MACHI_QUALITY_PRESETS[id]); }}
                    />
                </Row>
                {!readOnlyExternalTunings && <StageModeQualityRow mode="machi" antialias />}
                <Row label={t('options.machiAntialias')} note={t('stageQuality.aaHint')}>
                    <Select<MachiQuality['antialias']> value={quality.antialias} options={[
                        {value: MACHI_FOLLOW_GLOBAL, label: t('stageQuality.follow')},
                        ...MACHI_ANTIALIAS_MODES.map(mode => ({value: mode, label: t(ANTIALIAS_LABEL_KEYS[mode])})),
                    ]} onChange={antialias => setQuality({antialias})}/>
                </Row>
                <Row label={t('options.machiShadows')} note={t('options.machiShadowsHint')}>
                    <Segmented<MachiDetailLevel> value={quality.shadows} options={levels} onChange={shadows => setQuality({ shadows })} />
                </Row>
                <Row label={t('options.machiReflections')} note={t('options.machiReflectionsHint')}>
                    <Segmented<MachiDetailLevel> value={quality.reflections} options={levels} onChange={reflections => setQuality({ reflections })} />
                </Row>
                <ToggleRow
                    label={t('options.machiGlow')}
                    note={t('options.machiGlowHint')}
                    checked={quality.glow}
                    onChange={glow => setQuality({ glow })}
                />
                <ToggleRow
                    label={t('options.machiAdaptive')}
                    note={quality.adaptive && degraded > 0
                        ? `${t('options.machiAdaptiveHint')} ${format('options.machiAdaptiveActive', { count: degraded })}`
                        : t('options.machiAdaptiveHint')}
                    checked={quality.adaptive}
                    onChange={adaptive => setQuality({ adaptive })}
                />
            </Group>
        </>
    );
};

// Dragging edits a local draft; releasing commits through the existing persistent store.
export default function MachiSettingsPanelBridge(props: VisualizerSettingsPanelProps) {
    const saved = useVisualizerSettingsStore(state => state.machiTuning);
    const [draft, setDraft] = useState(saved);
    const dragging = useRef(false);
    const latest = useRef(draft);
    useEffect(() => { if (!dragging.current) { setDraft(saved); latest.current = saved; } }, [saved]);
    const commit = () => {
        dragging.current = false;
        if (!props.onMachiTuningChange) useVisualizerSettingsStore.getState().handleSetMachiTuning(latest.current);
        props.onSliderCommit?.();
    };
    return <MachiSettingsPanel {...props} tuning={props.machiTuning ?? draft}
        onTuningChange={props.onMachiTuningChange ?? (patch => {
            latest.current = { ...latest.current, ...patch }; setDraft(latest.current);
            if (!dragging.current) useVisualizerSettingsStore.getState().handleSetMachiTuning(latest.current);
        })}
        onSliderPointerDown={() => { dragging.current = true; props.onSliderPointerDown?.(); }}
        onSliderCommit={commit} />;
}


import type {DualTheme} from '../types';
import type {ObsBrowserSourceConfig} from '../types/obsBrowserSource';
import type {RearUploadedFont} from './rearLyricsFont';
import { normalizeRearRandomPolicy } from './rearRandomVisualizer';

// src/services/rearStageAppearance.ts
// Only visual fields may cross scopes. Song, clock, seed and rear geometry stay live.
export const rearVisualKeys=['theme','subtitleTheme','isDaylight','visualizerMode','randomVisualizer','visualizerFrameRate','visualizerTunings','background','lyricsFontScale','subtitleFontScale','visualizerOpacity','subtitleOverlayOpacity','subtitleOverlayBackground','subtitleUpcomingLyricsBlur','showHarmonySubtitle','harmonySubtitleBackground','staticMode','hideTranslationSubtitle','showSubtitleTranslation','subtitleContentMode','cappellaCustomEmojiImages','cappellaCustomAvatarImages','monetPortraitImage','temperaLayerImageAssets'] as const;
export type RearVisualConfig=Pick<ObsBrowserSourceConfig,typeof rearVisualKeys[number]>;
export type RearAppearanceData={version:1;mode:'follow'|'independent';profile:{visual:RearVisualConfig;font:RearUploadedFont|null;themes?:DualTheme}|null};
export function captureRearVisual(config:ObsBrowserSourceConfig):RearVisualConfig{
    const visual = Object.fromEntries(rearVisualKeys.filter(key=>config[key]!==undefined).map(key=>[key,config[key]])) as RearVisualConfig;
    if (visual.randomVisualizer) visual.randomVisualizer = normalizeRearRandomPolicy(visual.randomVisualizer);
    return visual;
}
export function resolveRearStageConfig(front:ObsBrowserSourceConfig,data:RearAppearanceData):ObsBrowserSourceConfig{
    if(data.mode!=='independent'||!data.profile)return front;
    const visual=captureRearVisual(data.profile.visual as ObsBrowserSourceConfig);
    const policy=visual.randomVisualizer;
    return {...front,...visual,randomVisualizer:policy?{...policy,seed:policy.seed+':rear'}:undefined,
        randomVisualizerSongKey:undefined,randomVisualizerSelectedMode:undefined};
}
export function validateRearAppearance(value:unknown):RearAppearanceData{
    const v=value as RearAppearanceData;
    if(!v||v.version!==1||!['follow','independent'].includes(v.mode)||v.mode==='independent'&&!v.profile)throw new Error('Invalid rear appearance');
    if(v.profile&&(!v.profile.visual?.theme||typeof v.profile.visual.visualizerMode!=='string'))throw new Error('Invalid rear stage visual');
    return {version:1,mode:v.mode,profile:v.profile?{visual:captureRearVisual(v.profile.visual as ObsBrowserSourceConfig),font:v.profile.font??null,...(v.profile.themes?{themes:v.profile.themes}:{})}:null};
}

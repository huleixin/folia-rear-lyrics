import type { VisualizerBackgroundConfig } from '../backgrounds/definition';
import type { NebbiaTuning } from './types';
// Transparent glass retains the existing shared background.
export const nebbiaSeesThrough = (tuning: NebbiaTuning, background: VisualizerBackgroundConfig | undefined, isPreview = false) => tuning.behind === 'backdrop' || (!isPreview && Boolean(background?.transparent));
/**
 * Rear panels host one wallpaper behind a transparent lyric frame, so the frame is forced transparent there.
 * Nebbia's own window (rain street, aquarium) must still paint itself, otherwise the glass only shows
 * that outer wallpaper and every "窗外" choice looks identical.
 */
export const nebbiaRearPaintsOwnWindow = (behind: NebbiaTuning['behind'] | undefined) => behind === 'night' || behind === 'aquarium';

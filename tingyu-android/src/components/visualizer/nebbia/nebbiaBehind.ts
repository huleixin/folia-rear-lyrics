import type { VisualizerBackgroundConfig } from '../backgrounds/definition';
import type { NebbiaTuning } from './types';
// Transparent glass retains the existing shared background.
export const nebbiaSeesThrough = (tuning: NebbiaTuning, background: VisualizerBackgroundConfig | undefined, isPreview = false) => tuning.behind === 'backdrop' || (!isPreview && Boolean(background?.transparent));

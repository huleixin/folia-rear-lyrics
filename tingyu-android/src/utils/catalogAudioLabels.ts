import type { SongResult } from '../types';
import { normalizeCatalogAudioSpecs } from '../types/catalogAudioSpecs';

// src/utils/catalogAudioLabels.ts
/** Keep artist metadata readable: at most two small catalog badges, never inferred from playback settings. */
export function getCatalogAudioLabels(song: Pick<SongResult, 'catalogAudioSpecs'>, t: (key: string) => string): string[] {
    return (normalizeCatalogAudioSpecs(song.catalogAudioSpecs) || []).slice(0, 2).map(spec => t(`catalogAudioSpecs.${spec}`));
}

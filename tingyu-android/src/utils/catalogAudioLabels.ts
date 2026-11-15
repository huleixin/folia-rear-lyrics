import { isCapacitorAndroid } from '../platform/runtime';
import { getPersistentAudioKey } from '../services/onlineMusic/resourceKeys';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import type { SongResult } from '../types';
import { normalizeCatalogAudioSpecs } from '../types/catalogAudioSpecs';

// src/utils/catalogAudioLabels.ts
/** Keep artist metadata readable: at most two small catalog badges, never inferred from playback settings. */
export function getCatalogAudioLabels(song: Pick<SongResult, 'catalogAudioSpecs'>, t: (key: string) => string): string[] {
    return (normalizeCatalogAudioSpecs(song.catalogAudioSpecs) || []).slice(0, 2).map(spec => t(`catalogAudioSpecs.${spec}`));
}

type CatalogBadgeSong = Pick<SongResult, 'catalogAudioSpecs' | 'catalogAccess'>;
export type CatalogBadge = { id: string; label: string };

/** One primary quality, one independent version and one access requirement; no network or playback inference. */
export function getCatalogBadges(song: CatalogBadgeSong, t: (key: string) => string): CatalogBadge[] {
    const specs = normalizeCatalogAudioSpecs(song.catalogAudioSpecs) || [];
    const quality = specs.find(spec => spec !== 'dolby' && spec !== 'dts' && spec !== 'jyeffect' && spec !== 'sky');
    const version = specs.find(spec => spec === 'jyeffect' || spec === 'sky') ?? specs.find(spec => spec === 'dolby' || spec === 'dts');
    const ids: string[] = [...(quality ? [quality] : []), ...(version ? [version] : [])];
    if (song.catalogAccess === 'vip' || song.catalogAccess === 'paid') ids.push(song.catalogAccess);
    return ids.map(id => ({ id, label: t(`catalogAudioSpecs.${id}`) }));
}

/** Shared semantic frame for native song rows; includes the full known metadata for accessibility. */
export function catalogBadgePageFields(song: CatalogBadgeSong & Partial<Pick<SongResult,'id'|'sourceRef'|'name'>>, t: (key: string, options?: Record<string, unknown>) => string, local = false):{audioCacheKey?:string;audioSpecs?:string[];audioSpecsLabel?:string} {
    const badges = getCatalogBadges(song, t);
    const cacheFields=!local&&song.id!==undefined&&isCapacitorAndroid()?{audioCacheKey:getPersistentAudioKey(song as SongResult,useAudioSettingsStore.getState().audioQuality)}:{};
    if (!badges.length) return cacheFields;
    const labels = (normalizeCatalogAudioSpecs(song.catalogAudioSpecs) || []).map(spec => t(`catalogAudioSpecs.${spec}`));
    if (song.catalogAccess === 'vip' || song.catalogAccess === 'paid') labels.push(t(`catalogAudioSpecs.${song.catalogAccess}`));
    return {
        ...cacheFields,
        audioSpecs: badges.map(badge => badge.id),
        audioSpecsLabel: t(local ? 'localMusic.audioSpecsLabel' : 'catalogAudioSpecs.description', { specs: labels.join(' / ') }),
    };
}

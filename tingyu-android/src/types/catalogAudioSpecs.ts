// src/types/catalogAudioSpecs.ts
/** Catalog capabilities only: these never describe the selected stream or account entitlement. */
export type CatalogAudioSpec = 'high' | 'lossless' | 'hires' | 'dolby' | 'dts';
const ORDER: readonly CatalogAudioSpec[] = ['hires', 'lossless', 'high', 'dolby', 'dts'];
export function normalizeCatalogAudioSpecs(value: unknown): CatalogAudioSpec[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const known = new Set(value.slice(0, 12));
    const quality = ORDER.slice(0, 3).find(spec => known.has(spec));
    const result = [...(quality ? [quality] : []), ...ORDER.slice(3).filter(spec => known.has(spec))];
    return result.length ? result : undefined;
}

// src/types/catalogAudioSpecs.ts
/**
 * Catalog capabilities only: these never describe the selected stream or account entitlement.
 *
 * `master`（母带）只来自有来源依据的母带档位，不从 Hi-Res 或歌名推断。
 * NetEase jyeffect（高清臻音）和 sky（沉浸环绕声）保留独立含义，不等同于 Dolby / DTS。
 */
export type CatalogAudioSpec = 'high' | 'lossless' | 'hires' | 'master' | 'jyeffect' | 'sky' | 'dolby' | 'dts';
/** Catalog pricing category, never proof of the current account's entitlement. */
export type CatalogAccess = 'vip' | 'paid';
export interface CatalogAudioFields {
    catalogAudioSpecs?: CatalogAudioSpec[];
    catalogAccess?: CatalogAccess;
}
export const normalizeCatalogAccess = (value: unknown): CatalogAccess | undefined => (
    value === 'vip' || value === 'paid' ? value : undefined
);
const ORDER: readonly CatalogAudioSpec[] = ['master', 'hires', 'lossless', 'high', 'jyeffect', 'sky', 'dolby', 'dts'];
export function normalizeCatalogAudioSpecs(value: unknown): CatalogAudioSpec[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const known = new Set(value.slice(0, 12));
    const quality = ORDER.slice(0, 4).find(spec => known.has(spec));
    // A catalog with only an immersive version still has a valid specification.
    const result = [...(quality ? [quality] : []), ...ORDER.slice(4).filter(spec => known.has(spec))];
    return result.length ? result : undefined;
}

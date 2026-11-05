// src/types/catalogAudioSpecs.ts
/**
 * Catalog capabilities only: these never describe the selected stream or account entitlement.
 *
 * `master`（臻品母带）是类型层面的真实入口：平台解析器**只有**在原始数据里真的读到
 * master 档位字段时才允许产出它（当前 QQ/网易/酷狗的解析器都没有对应字段，所以
 * 运行时永远不会出现）——没有数据入口的档位一律不显示，禁止从 hires/歌名推断。
 */
export type CatalogAudioSpec = 'high' | 'lossless' | 'hires' | 'master' | 'dolby' | 'dts';
const ORDER: readonly CatalogAudioSpec[] = ['master', 'hires', 'lossless', 'high', 'dolby', 'dts'];
export function normalizeCatalogAudioSpecs(value: unknown): CatalogAudioSpec[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const known = new Set(value.slice(0, 12));
    const quality = ORDER.slice(0, 4).find(spec => known.has(spec));
    const result = [...(quality ? [quality] : []), ...ORDER.slice(4).filter(spec => known.has(spec))];
    return result.length ? result : undefined;
}

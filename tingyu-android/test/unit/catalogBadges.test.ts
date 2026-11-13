import { describe, expect, it } from 'vitest';
import { catalogBadgePageFields, getCatalogBadges } from '../../src/utils/catalogAudioLabels';

// test/unit/catalogBadges.test.ts
const t = (key: string, options?: Record<string, unknown>) => options?.specs ? `${key}: ${options.specs}` : key;

describe('catalog row badges', () => {
    it('keeps primary quality, version and access independent without stacking quality tiers', () => {
        expect(getCatalogBadges({ catalogAudioSpecs: ['high', 'hires', 'lossless', 'dolby', 'dts'], catalogAccess: 'vip' }, t).map(b => b.id))
            .toEqual(['hires', 'dolby', 'vip']);
    });
    it('shows DTS even without a quality tier, without claiming DTS:X or spatial playback', () => {
        expect(getCatalogBadges({ catalogAudioSpecs: ['dts'], catalogAccess: 'paid' }, t).map(b => b.id)).toEqual(['dts', 'paid']);
    });
    it('preserves NetEase immersive versions as distinct catalog facts', () => {
        expect(getCatalogBadges({ catalogAudioSpecs: ['hires', 'jyeffect', 'sky', 'dolby'] }, t).map(b => b.id)).toEqual(['hires', 'jyeffect']);
        expect(getCatalogBadges({ catalogAudioSpecs: ['sky'], catalogAccess: 'vip' }, t).map(b => b.id)).toEqual(['sky', 'vip']);
    });
    it('never invents metadata for old or malformed rows', () => {
        expect(getCatalogBadges({}, t)).toEqual([]);
        expect(getCatalogBadges({ catalogAudioSpecs: ['unknown' as never], catalogAccess: 'unknown' as never }, t)).toEqual([]);
    });
    it('native frames retain all three categories and full accessible version information', () => {
        const fields = catalogBadgePageFields({ catalogAudioSpecs: ['lossless', 'dolby', 'dts'], catalogAccess: 'vip' }, t);
        expect(fields.audioSpecs).toEqual(['lossless', 'dolby', 'vip']);
        expect(fields.audioSpecsLabel).toContain('catalogAudioSpecs.dts');
        expect(fields.audioSpecsLabel).toContain('catalogAudioSpecs.vip');
    });
    it('keeps local file metadata distinct from platform catalog claims', () => {
        expect(catalogBadgePageFields({ catalogAudioSpecs: ['hires'] }, t, true).audioSpecsLabel).toContain('localMusic.audioSpecsLabel');
        expect(catalogBadgePageFields({}, t)).toEqual({});
    });
});

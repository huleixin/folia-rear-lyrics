import { describe, expect, it } from 'vitest';
import { orderMobileRecommendations } from '@/library/suites/mobile/mobileRecommendationOrder';
import type { LibraryHomeCard } from '@/library/core/contracts/homeModel';

// test/unit/library/mobileRecommendationOrder.test.ts
const card = (id: string, type = 'playlist') => ({ id, type, name: id, raw: { id } } as LibraryHomeCard);
describe('mobile recommendation order', () => {
    it('keeps real FM and daily entry first, then deduplicated upstream playlist order', () => {
        const items = [
            card('second'),
            card('daily_recommendations', 'daily_recommendations'),
            card('personal_fm', 'radio'),
            card('first'),
            card('second'),
        ];
        expect(orderMobileRecommendations(items).map((item) => item.id)).toEqual([
            'personal_fm',
            'daily_recommendations',
            'second',
            'first',
        ]);
    });
    it('never invents personal/daily data when unsupported, and caps the rail', () => {
        expect(orderMobileRecommendations([])).toEqual([]);
        expect(orderMobileRecommendations([card('p'), card('artist', 'artist')]).map((item) => item.id)).toEqual(['p']);
        expect(orderMobileRecommendations(Array.from({ length: 25 }, (_, index) => card(String(index))))).toHaveLength(
            10
        );
    });
});

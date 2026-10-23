import type { LibraryHomeCard } from '../../core/contracts/homeModel';
import { DAILY_RECOMMENDATIONS_CARD_ID, isPersonalFmCard } from '../../core/model/homeCards';

// src/library/suites/mobile/mobileRecommendationOrder.ts
export function orderMobileRecommendations(cards: LibraryHomeCard[]): LibraryHomeCard[] {
    const fm = cards.find(isPersonalFmCard);
    const daily = cards.find(
        (card) => card.type === 'daily_recommendations' && card.id === DAILY_RECOMMENDATIONS_CARD_ID
    );
    const seen = new Set<string>();
    const playlists = cards.filter((card) => {
        const key = `${card.type}:${card.id}`;
        if (card.type !== 'playlist' || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return [...(fm ? [fm] : []), ...(daily ? [daily] : []), ...playlists].slice(0, 10);
}

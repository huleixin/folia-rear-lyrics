import { expect, it } from 'vitest';
import { visibleDiscoverySection } from '@/services/discovery/visibility';
import { qishuiRecommendations } from '@/services/onlineMusic/qishui/qishuiRecommendations';
import type { PageSection } from '@/types/nativePages';

// Platform capability and empty content are independent of saved layout preferences.
it('does not expose scene radio as recommended playlists', () => {
    expect(qishuiRecommendations.getRecommendedCollections).toBeUndefined();
    expect(qishuiRecommendations.getPersonalFm).toBeTypeOf('function');
});
it('hides unsupported collections even if a previous cache contains cards', () => {
    const section: PageSection = { id: 'collections', layout: 'cards', items: [{ id: 'old', title: 'cached' }] };
    expect(visibleDiscoverySection('collections', section, false)).toBe(false);
    expect(visibleDiscoverySection('collections', section, true)).toBe(true);
});
it.each(['collections', 'recent', 'playlists', 'songs', 'radars', 'shortcuts'])('removes the empty %s section with its heading and more action', id => {
    expect(visibleDiscoverySection(id, { id, layout: 'cards', title: 'heading', more: 'all', items: [] }, true)).toBe(false);
});

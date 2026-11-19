import type { PageSection } from '../../types/nativePages';

// Recommendation content visibility is local to this platform; user preferences remain unchanged.
export function visibleDiscoverySection(id: string, section: PageSection, collectionsSupported: boolean): boolean {
    if (id === 'collections' && !collectionsSupported) return false;
    if (['collections', 'recent', 'playlists', 'songs', 'radars', 'shortcuts'].includes(id)) {
        return Boolean(section.items?.length);
    }
    return true;
}

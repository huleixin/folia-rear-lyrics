import { describe, expect, it } from 'vitest';
import { searchLocalCatalogEntities } from '@/services/search/deviceSearch';
import type { LocalLibraryAssignment, LocalLibraryEntity } from '@/types/localLibrary';
import type { LocalSong } from '@/types';

// test/unit/search/deviceSearchLocalCatalog.test.ts
const entity = (id: string, kind: 'artist' | 'album', displayName: string, extra: Partial<LocalLibraryEntity> = {}): LocalLibraryEntity => ({
    id, kind, displayName, aliases: [], normalizedAliases: [], createdAt: 0, updatedAt: 0, ...extra,
});
const song = (id: string) => ({ id }) as LocalSong;
const catalog = (entities: LocalLibraryEntity[], assignments: LocalLibraryAssignment[]) => ({ entities, assignments, ready: true, reload: async () => {} });

describe('local catalog entity search', () => {
    it('matches display names and aliases, follows merged redirects, deduplicates assignment membership and preserves song count', () => {
        const entities = [
            entity('artist-main', 'artist', '周杰伦', { aliases: ['Jay Chou'], normalizedAliases: ['zhoujielun'] }),
            entity('artist-merged', 'artist', '周杰倫', { mergedInto: 'artist-main' }),
            entity('album', 'album', '叶惠美', { aliases: ['Yeh Hui-mei'], normalizedAliases: ['yehhui-mei'] }),
        ];
        const assignments = [
            { songId: 'song-b', artistEntityIds: ['artist-main', 'artist-merged'], artistOrigin: 'manual', albumEntityId: 'album', albumOrigin: 'manual', updatedAt: 0 },
            { songId: 'song-a', artistEntityIds: ['artist-merged'], artistOrigin: 'manual', albumEntityId: 'album', albumOrigin: 'manual', updatedAt: 0 },
            { songId: 'missing', artistEntityIds: ['artist-main'], artistOrigin: 'manual', albumEntityId: 'album', albumOrigin: 'manual', updatedAt: 0 },
        ] satisfies LocalLibraryAssignment[];
        const songs = [song('song-a'), song('song-b')];
        const artists = searchLocalCatalogEntities('artist', 'jay chou', catalog(entities, assignments), songs, 10, 0);
        expect(artists.items).toEqual([{ providerId: 'local', id: 'artist-main', name: '周杰伦', aliases: ['Jay Chou'], songCount: 2 }]);
        expect(searchLocalCatalogEntities('album', 'yehhui-mei', catalog(entities, assignments), songs, 10, 0).items[0]).toMatchObject({ id: 'album', trackCount: 2 });
    });

    it('keeps stable entity ordering and pagination, excludes empty entities, and waits for catalog readiness', () => {
        const entities = [entity('one', 'artist', 'Alpha'), entity('empty', 'artist', 'Alpine'), entity('two', 'artist', 'Alto')];
        const assignments: LocalLibraryAssignment[] = [
            { songId: '2', artistEntityIds: ['two'], artistOrigin: 'manual', albumOrigin: 'manual', updatedAt: 0 },
            { songId: '1', artistEntityIds: ['one'], artistOrigin: 'manual', albumOrigin: 'manual', updatedAt: 0 },
        ];
        const page = searchLocalCatalogEntities('artist', 'al', catalog(entities, assignments), [song('1'), song('2')], 1, 0);
        expect(page).toMatchObject({ items: [{ id: 'one' }], total: 2, hasMore: true, nextOffset: 1 });
        expect(searchLocalCatalogEntities('artist', 'al', { ...catalog(entities, assignments), ready: false }, [song('1')], 10, 0).items).toEqual([]);
    });
});

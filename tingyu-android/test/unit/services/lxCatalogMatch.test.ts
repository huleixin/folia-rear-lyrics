import { expect, it, vi } from 'vitest';
import { matchLxCatalogSong } from '@/services/lxSource/catalogMatch';
import type { SongResult } from '@/types';

// test/unit/services/lxCatalogMatch.test.ts
const { search } = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('@/services/onlineMusic/omni', () => ({ omni: { searchProviderSongs: search } }));
const song = (provider: string, name = 'Song', artist = 'Singer', durationMs = 120000) => ({
    id: '7', name, artists: [{ id: '1', name: artist }], album: { id: '', name: 'Album' }, durationMs,
    sourceRef: { kind: 'online', providerId: provider, mediaId: '7' },
}) as SongResult;
it('uses the existing platform identifier without searching or changing the queue song', async () => {
    search.mockClear(); const original = song('qq');
    expect(await matchLxCatalogSong(original, { tx: { name: 'QQ', qualitys: ['128k'] } })).toBe(original);
    expect(search).not.toHaveBeenCalled();
});
it('tries another declared platform after a search failure, rejecting wrong artist/version matches', async () => {
    search.mockReset().mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce({ items: [song('lx-mg', 'Song', 'Other'), song('lx-mg', 'Song', 'Singer', 300000), song('lx-mg')] });
    const original = song('unsupported');
    const result = await matchLxCatalogSong(original, { kw: { name: 'Kuwo', qualitys: ['128k'] }, mg: { name: 'Migu', qualitys: ['128k'] } });
    expect(result.sourceRef).toMatchObject({ providerId: 'lx-mg' });
    expect(original.sourceRef).toMatchObject({ providerId: 'unsupported' });
    expect(search).toHaveBeenCalledTimes(2);
});

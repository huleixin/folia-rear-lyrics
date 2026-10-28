// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { omni } from '@/services/onlineMusic/omni';
import { useLxSourceStore } from '@/stores/useLxSourceStore';
import { useOnlineProviderAccountStore } from '@/stores/useOnlineProviderAccountStore';
import { isSongUnavailable } from '@/services/onlineMusic/songAvailability';
import type { LxScript } from '@/services/lxSource/contract';
import type { SongResult } from '@/types';

// test/unit/onlineMusic/lxPlaylistPlayback.test.ts
const { resolve } = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('@/services/lxSource/playback', () => ({ resolveLxSource: resolve }));
const saved = useLxSourceStore.getState(), accounts = useOnlineProviderAccountStore.getState();
afterEach(() => { useLxSourceStore.setState(saved); useOnlineProviderAccountStore.setState(accounts); vi.clearAllMocks(); });
it.each(['qq', 'netease', 'kugou'])('keeps %s playlist/account identity while using the selected script for playback', async provider => {
    const script = { id: 'playlist-test',name:'test',version:'1',description:'',author:'',homepage:'', code: '', capabilities: { tx: { name: 'QQ', qualitys: ['128k'] } } } as LxScript;
    useLxSourceStore.setState({ scripts: [script], activeId: null });
    useOnlineProviderAccountStore.getState().setActiveProviderId(provider);
    omni.activateLxSource(script.id);
    expect(useOnlineProviderAccountStore.getState().activeProviderId).toBe(provider);
    const song = { id: '7', name: 'Song', artists: [], album: { id: '', name: '' }, durationMs: 120000,
        sourceRef: { kind: 'online', providerId: provider, mediaId: '7' } } as SongResult;
    const before = structuredClone(song);
    resolve.mockResolvedValue({ url: 'https://audio.example/lx.mp3', quality: 'high', fetchedAt: 1 });
    expect(isSongUnavailable(song)).toBe(false);
    expect((await omni.getAudioSource(song, 'high'))?.url).toContain('/lx.mp3');
    expect(resolve).toHaveBeenCalledWith(song, 'high');
    expect(song).toEqual(before);
});

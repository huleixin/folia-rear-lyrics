import { beforeEach, describe, expect, it, vi } from 'vitest';

// test/unit/library/app/libraryAccountPort.test.ts
// 浏览平台切换只更新搜索和集合导航；混合队列、播放状态、歌词和 provider 级缓存保持不变。

const services = vi.hoisted(() => ({ clearPrefetchRuntime: vi.fn(), clearTrackProfileRuntime: vi.fn() }));
vi.mock('@/services/prefetchService', () => ({ clearPrefetchRuntime: services.clearPrefetchRuntime }));
vi.mock('@/services/automix/profileService', () => ({ clearTrackProfileRuntime: services.clearTrackProfileRuntime }));

import { createLibraryAccountSwitchCleanupPort, type LibraryAccountSwitchHost } from '@/library/app/createLibraryAccountPort';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useSearchNavigationStore } from '@/stores/useSearchNavigationStore';
import { useCollectionNavigationStore } from '@/stores/useCollectionNavigationStore';
import { PlayerState, type SongResult } from '@/types';
import { getPlaybackSongKey } from '@/utils/appPlaybackGuards';

const song = { id: 's1', name: 'Song', artists: [], album: { id: '', name: '' } } as unknown as SongResult;

const fakeAudio = () => ({ pause: vi.fn(), removeAttribute: vi.fn(), load: vi.fn() });

describe('provider switch cleanup port', () => {
    it('retains both platforms when media IDs overlap', () => {
        const queue = ['qq', 'netease'].map(providerId => ({ ...song,
            sourceRef: { kind: 'online' as const, providerId, mediaId: 's1' } }));
        usePlaybackStore.setState({ playQueue: queue, currentSong: queue[0] });
        const port = createLibraryAccountSwitchCleanupPort(() => { throw new Error('must not touch playback'); });
        port.resetForProviderSwitch('netease', 'qq');
        expect(usePlaybackStore.getState().playQueue.map(getPlaybackSongKey)).toEqual(['online:qq:s1', 'online:netease:s1']);
        expect(usePlaybackStore.getState().currentSong).toBe(queue[0]);
    });
    beforeEach(() => {
        vi.clearAllMocks();
        usePlaybackStore.setState({
            audioSrc: 'blob:old-track',
            currentSong: song,
            playQueue: [song],
            cachedCoverUrl: 'cover.png',
            isFmMode: true,
            playerState: PlayerState.PLAYING,
        });
    });

    it('retains playback while clearing the outgoing provider\'s runtime before the switch commits', () => {
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const resetRuntime = vi.spyOn(useSearchNavigationStore.getState(), 'resetRuntime');
        const clearNavigation = vi.spyOn(useCollectionNavigationStore.getState(), 'clear');
        const audio = fakeAudio();
        const automix = { abortTransition: vi.fn() };
        const setLyrics = vi.fn();
        const host: LibraryAccountSwitchHost = {
            audioRef: { current: audio as unknown as HTMLAudioElement },
            automixRef: { current: automix },
            setLyrics,
        };
        const port = createLibraryAccountSwitchCleanupPort(() => host);

        port.resetForProviderSwitch('kugou', 'netease');

        expect(automix.abortTransition).not.toHaveBeenCalled();
        expect(audio.pause).not.toHaveBeenCalled();
        expect(audio.removeAttribute).not.toHaveBeenCalled();
        expect(audio.load).not.toHaveBeenCalled();
        expect(revoke).not.toHaveBeenCalled();
        expect(setLyrics).not.toHaveBeenCalled();
        expect(usePlaybackStore.getState()).toMatchObject({
            audioSrc: 'blob:old-track',
            currentSong: song,
            playQueue: [song],
            cachedCoverUrl: 'cover.png',
            isFmMode: true,
            playerState: PlayerState.PLAYING,
        });
        expect(services.clearPrefetchRuntime).not.toHaveBeenCalled();
        expect(services.clearTrackProfileRuntime).not.toHaveBeenCalled();
        expect(resetRuntime).toHaveBeenCalledWith('kugou');
        expect(clearNavigation).toHaveBeenCalledTimes(1);
        revoke.mockRestore();
    });

    it('leaves non-blob playback running across a browsing switch', () => {
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        usePlaybackStore.setState({ audioSrc: 'https://example.test/a.mp3' });
        let host: LibraryAccountSwitchHost = {
            audioRef: { current: null },
            automixRef: { current: null },
            setLyrics: vi.fn(),
        };
        const port = createLibraryAccountSwitchCleanupPort(() => host);
        const laterAudio = fakeAudio();
        host = { ...host, audioRef: { current: laterAudio as unknown as HTMLAudioElement } };

        port.resetForProviderSwitch('qq', 'netease');

        expect(laterAudio.pause).not.toHaveBeenCalled();
        expect(revoke).not.toHaveBeenCalled();
        revoke.mockRestore();
    });
});

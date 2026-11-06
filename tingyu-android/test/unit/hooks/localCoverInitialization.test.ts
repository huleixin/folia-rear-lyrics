// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';
import { syncCurrentLocalCover, usePlaybackUiEffects } from '@/hooks/usePlaybackUiEffects';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { PlayerState, type SongResult } from '@/types';

// test/unit/hooks/localCoverInitialization.test.ts
// 冷启动初始化流程回归：恢复出的歌曲对象只带身份、不带封面时，页面必须主动
// 回读曲库并把封面写进统一播放状态；不能只依赖后续切歌事件，不能串歌，
// 不能覆盖有效封面，也不能触碰音源 / 播放状态 / 进度。

const mocks = vi.hoisted(() => ({ getLocalSong: vi.fn(), preferred: vi.fn() }));
vi.mock('@/services/db', () => ({ getLocalSong: mocks.getLocalSong }));
vi.mock('@/services/localCoverAssetUrl', () => ({ getPreferredLocalSongCoverUrl: mocks.preferred }));

const COVER = '/__folia_cover/sha256:abc?size=1024';
const makeSong = (id: string): SongResult => ({
    id,
    name: 'Song ' + id,
    artists: [],
    durationMs: 240000,
    album: { id: 0, name: 'Album' },
    sourceRef: { kind: 'local', mediaId: id },
    localRef: { songId: id },
} as unknown as SongResult);
const coverOf = (song: SongResult | null) => (song?.album as unknown as { coverUrl?: string } | undefined)?.coverUrl;

const uiEffectOptions = () => ({
    statusMsg: null,
    updateCacheSize: () => {},
    loadLocalSongs: () => {},
    loadLocalPlaylists: async () => {},
    localMusicUpdatedEvent: 'folia-local-music-updated',
    blobUrlRef: { current: null },
    volumePreviewFrameRef: { current: null },
});

beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    mocks.getLocalSong.mockResolvedValue({ id: 's1', localCoverAssetId: 'sha256:abc' });
    mocks.preferred.mockReturnValue(COVER);
    usePlaybackStore.setState({
        currentSong: null, cachedCoverUrl: null, audioSrc: null, playQueue: [],
        playerState: PlayerState.PAUSED, activePlaybackContext: 'main',
    });
});

it('暂停状态冷启动：恢复对象缺封面时主动回读曲库并写入统一播放状态', async () => {
    usePlaybackStore.setState({
        currentSong: makeSong('s1'),
        audioSrc: 'content://media/external/audio/1',
        playerState: PlayerState.PAUSED,
    });
    await syncCurrentLocalCover();

    const state = usePlaybackStore.getState();
    expect(mocks.getLocalSong).toHaveBeenCalledWith('s1');
    expect(state.cachedCoverUrl).toBe(COVER);
    expect(coverOf(state.currentSong)).toBe(COVER);
    // 只写封面：不重置音源、不改变暂停状态，播放进度恢复链路不受影响。
    expect(state.audioSrc).toBe('content://media/external/audio/1');
    expect(state.playerState).toBe(PlayerState.PAUSED);

    // 连续多次冷启动：已正确时幂等，不再重建歌曲对象、不产生无谓重推。
    const snapshot = state.currentSong;
    await syncCurrentLocalCover();
    expect(usePlaybackStore.getState().currentSong).toBe(snapshot);
});

it('页面初始化后，恢复完成事件会主动读取当前歌曲，不必等待切歌事件', async () => {
    usePlaybackStore.setState({ currentSong: makeSong('s1') });
    const root = createRoot(document.createElement('div'));
    const options = uiEffectOptions();
    const Probe = () => { usePlaybackUiEffects(options as never); return null; };
    try {
        await act(async () => { root.render(h(Probe)); });
        await act(async () => {});               // 让 mount 时的首次 sync 落定
        mocks.getLocalSong.mockClear();
        await act(async () => { window.dispatchEvent(new Event('tingyu-playback-recovery-ready')); });
        expect(mocks.getLocalSong).toHaveBeenCalledWith('s1');
        expect(usePlaybackStore.getState().cachedCoverUrl).toBe(COVER);
    } finally {
        await act(async () => { root.unmount(); });
    }
});

it('异步读库期间切歌，旧歌封面不会写到新歌上', async () => {
    let finish!: (value: unknown) => void;
    mocks.getLocalSong.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    usePlaybackStore.setState({ currentSong: makeSong('s1') });

    const running = syncCurrentLocalCover();
    usePlaybackStore.setState({ currentSong: makeSong('s2'), cachedCoverUrl: null });
    finish({ id: 's1', localCoverAssetId: 'sha256:abc' });
    await running;

    const state = usePlaybackStore.getState();
    expect(coverOf(state.currentSong)).toBeUndefined();
    expect(state.cachedCoverUrl).toBeNull();
});

it('曲库里没有真实封面时保持占位，不把已有有效封面清成空值', async () => {
    mocks.preferred.mockReturnValue(null);
    usePlaybackStore.setState({
        currentSong: makeSong('s1'),
        cachedCoverUrl: 'data:image/jpeg;base64,valid',
    });
    await syncCurrentLocalCover();
    expect(usePlaybackStore.getState().cachedCoverUrl).toBe('data:image/jpeg;base64,valid');
});

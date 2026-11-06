import { useEffect } from 'react';
import type React from 'react';
import type { SongResult, StatusMessage } from '../types';
import { setStatusMessage as setStatusMsg } from '../stores/useStatusMessageStore';
import { useAppViewStore } from '../stores/useAppViewStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { getLocalSong } from '../services/db';
import { getPreferredLocalSongCoverUrl } from '../services/localCoverAssetUrl';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';

// App-level UI side effects that do not own playback business logic.

/**
 * 本地封面是「先有歌、后补封面」：扫描 / 后台补全把 `localCoverAssetId` 写进曲库记录，
 * `folia-local-music-updated` 只让曲库列表重新渲染；而播放器读的是构建 UnifiedSong 时
 * 烘进 `album.coverUrl` 的快照与 `cachedCoverUrl`。这条单向数据流没有回写点，于是首次
 * 进入、切到本地歌、重启恢复后，列表有图而播放器 / 迷你条 / 通知一直是占位图，
 * 必须手动切一次歌才会重建快照。
 *
 * 这里复用曲库里已有的 assetId（不新建封面系统），按当前歌的 songId 回读最新记录，
 * 只回写两个封面字段；身份校验放在异步读库之后，避免把上一首的封面贴到下一首。
 *
 * 导出是为了让「冷启动初始化」能被回归测试直接调用：修复不能只靠切歌事件，
 * 页面初始化后必须能主动读取一次当前有效歌曲状态。
 */
export const syncCurrentLocalCover = async (): Promise<void> => {
    const song = usePlaybackStore.getState().currentSong;
    if (!song) return;
    const songId = (song as unknown as { localRef?: { songId?: string } }).localRef?.songId;
    if (!songId) return;
    const key = getPlaybackSongKey(song);
    if (!key) return;
    const record = await getLocalSong(songId);
    if (!record) return;
    const url = getPreferredLocalSongCoverUrl(record);
    if (!url) return;
    const fresh = usePlaybackStore.getState();
    const current = fresh.currentSong;
    // 读库期间用户可能已经切歌：旧歌的封面绝不能落到新歌上。
    if (!current || getPlaybackSongKey(current) !== key) return;
    const album = current.album;
    const existing = album && typeof album === 'object' ? album.coverUrl ?? '' : '';
    if (existing === url && fresh.cachedCoverUrl === url) return;
    const nextAlbum = {
        ...(album && typeof album === 'object' ? album : { id: 0, name: '' }),
        coverUrl: url,
    } as SongResult['album'];
    // 原子写：不改身份、时长、音源与播放状态，不重建播放器。
    usePlaybackStore.setState({
        currentSong: { ...current, album: nextAlbum },
        cachedCoverUrl: url,
    });
};

type UsePlaybackUiEffectsOptions = {

    statusMsg: StatusMessage | null;
    updateCacheSize: () => void;
    loadLocalSongs: () => void | Promise<void>;
    loadLocalPlaylists: () => Promise<void>;
    localMusicUpdatedEvent: string;
    blobUrlRef: React.RefObject<string | null>;
    volumePreviewFrameRef: React.RefObject<number | null>;
    onClearPendingUnavailableSkip?: () => void;
};

export const usePlaybackUiEffects = ({
    statusMsg,
    updateCacheSize,
    loadLocalSongs,
    loadLocalPlaylists,
    localMusicUpdatedEvent,
    blobUrlRef,
    volumePreviewFrameRef,
    onClearPendingUnavailableSkip,
}: UsePlaybackUiEffectsOptions) => {
    const isPanelOpen = useAppViewStore(state => state.isPanelOpen);
    const panelTab = useAppViewStore(state => state.panelTab);

    useEffect(() => {
        const handleLocalMusicUpdated = () => {
            void loadLocalSongs();
            void loadLocalPlaylists();
        };

        window.addEventListener(localMusicUpdatedEvent, handleLocalMusicUpdated);
        return () => window.removeEventListener(localMusicUpdatedEvent, handleLocalMusicUpdated);
    }, [loadLocalPlaylists, loadLocalSongs, localMusicUpdatedEvent]);

    // 封面补全落库、冷启动恢复、切歌三条时机都要把最新 assetId 追到播放器快照上。
    // 不能只靠 store 的「currentSong 引用变化」：若恢复在挂载前已完成、或恢复写回的是
    // 同一对象，之后就再也不会有切歌事件。tingyu-playback-recovery-ready 是会话恢复
    // 完成的权威信号（finishRecovery 派发），在此主动读一次当前状态，不是定时重试。
    useEffect(() => {
        const sync = () => { void syncCurrentLocalCover(); };
        const unsubscribe = usePlaybackStore.subscribe((next, previous) => {
            if (next.currentSong !== previous.currentSong) sync();
        });
        const RECOVERY_READY_EVENT = 'tingyu-playback-recovery-ready';
        window.addEventListener(localMusicUpdatedEvent, sync);
        window.addEventListener(RECOVERY_READY_EVENT, sync);
        sync();
        return () => {
            unsubscribe();
            window.removeEventListener(localMusicUpdatedEvent, sync);
            window.removeEventListener(RECOVERY_READY_EVENT, sync);
        };
    }, [localMusicUpdatedEvent]);

    useEffect(() => {
        return () => {
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
            }
            if (volumePreviewFrameRef.current !== null) {
                cancelAnimationFrame(volumePreviewFrameRef.current);
            }
        };
    }, [blobUrlRef, volumePreviewFrameRef]);

    useEffect(() => {
        if (isPanelOpen && panelTab === 'account') {
            updateCacheSize();
        }
    }, [isPanelOpen, panelTab, updateCacheSize]);

    useEffect(() => {
        if (!statusMsg || statusMsg.persistent) {
            return;
        }

        const timer = window.setTimeout(() => {
            setStatusMsg(null);
        }, statusMsg.durationMs ?? 3000);
        return () => window.clearTimeout(timer);
    }, [setStatusMsg, statusMsg]);

    useEffect(() => {
        return () => onClearPendingUnavailableSkip?.();
    }, [onClearPendingUnavailableSkip]);
};

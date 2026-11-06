import { useEffect } from 'react';
import { PlayerState } from '../types';
import { usePlaybackStore, selectDisplaySong, selectDisplayPlayerState } from '../stores/usePlaybackStore';
import { useMobileLibraryStore } from '../stores/useMobileLibraryStore';
import { isLocalPlaybackSong, isNavidromePlaybackSong } from '../utils/appPlaybackGuards';
import { recordLocalSongPlay } from '../services/localPlayHistory';

// src/hooks/useMobileListeningHistory.ts
// Subscribe to discrete playback changes, not a clock; remains active while the original stage is open.
export const useMobileListeningHistory = () => {
    useEffect(() => {
        const record = () => {
            const state = usePlaybackStore.getState();
            const song = selectDisplaySong(state);
            if (!song || selectDisplayPlayerState(state) !== PlayerState.PLAYING) return;
            // 在线歌与本地歌各记各的历史，互不混写：在线仍进 localStorage 的 recentTracks
            // （原有行为不动，它明确不收本地歌）；本地进 IndexedDB 的播放计数，
            // 本地推荐首页的「最近播放 / 常听精选 / 常听专辑 / 久未播放」都从那里取。
            if (isLocalPlaybackSong(song)) {
                void recordLocalSongPlay(song.localRef.songId);
                return;
            }
            if (!isNavidromePlaybackSong(song)) {
                useMobileLibraryStore.getState().remember(song);
            }
        };
        record();
        return usePlaybackStore.subscribe(record);
    }, []);
};

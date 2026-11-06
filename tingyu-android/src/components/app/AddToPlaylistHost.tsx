import {useInterfaceLight} from '../../hooks/useInterfaceAppearance';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { LocalPlaylist } from '../../types';
import type { ProviderCollection } from '../../types/onlineMusic';
import PlaylistSelectionDialog from '../shared/PlaylistSelectionDialog';
import TextInputDialog from '../shared/TextInputDialog';
import { getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { omni } from '../../services/onlineMusic/omni';
import { selectDisplaySong, usePlaybackStore } from '../../stores/usePlaybackStore';
import { useAddToPlaylistStore } from '../../stores/useAddToPlaylistStore';
import { setStatusMessage } from '../../stores/useStatusMessageStore';
import { addLocalSongIdsToPlaylist, createLocalPlaylistWithSongIds } from '../../services/localPlaylistService';
import { LOCAL_MUSIC_UPDATED_EVENT } from '../../services/localMusicService';

// src/components/app/AddToPlaylistHost.tsx
// The playlist picker for the current song, and the "new playlist" prompt behind it.
//
// Lifted out of UnifiedPanel so it is not tied to the player panel being on screen: it answers a
// question about the song, not about the panel, and a command bound to a global shortcut has to be
// able to ask it from anywhere. The star button in the panel now only requests it.
//
// Everything the three sources need to be told apart stays here, in one place, because the answer
// depends on a Navidrome fetch — see the note in useAddToPlaylistStore.

type AddToPlaylistHostProps = {
    isDaylight: boolean;
    localPlaylists: LocalPlaylist[];
    onlinePlaylists: ProviderCollection[];
    onAddCurrentSongToOnlinePlaylist: (playlist: ProviderCollection) => Promise<void>;
    onAddCurrentSongToNavidromePlaylist: (playlistId: string) => Promise<void>;
    onCreateCurrentNavidromePlaylist: (name: string) => Promise<void>;
};

type PlaylistEntry = { id: string; name: string; description?: string };

export const AddToPlaylistHost: React.FC<AddToPlaylistHostProps> = ({
    isDaylight: stageDaylight,
    localPlaylists,
    onlinePlaylists,
    onAddCurrentSongToOnlinePlaylist,
    onAddCurrentSongToNavidromePlaylist,
    onCreateCurrentNavidromePlaylist,
}) => {
    const isDaylight=useInterfaceLight(stageDaylight);
    const { t } = useTranslation();
    // The song as the listener sees it, so a blend shows the track that is on screen.
    const currentSong = usePlaybackStore(selectDisplaySong);
    const { isOpen, close, setAvailability, targetSong } = useAddToPlaylistStore(useShallow(state => ({
        isOpen: state.isOpen,
        close: state.close,
        setAvailability: state.setAvailability,
        targetSong: state.targetSong,
    })));
    // 阶段二：从歌曲列表菜单进入时带目标歌曲；老入口（播放器星标/命令）不带，仍是「当前播放的歌」。
    const song = targetSong ?? currentSong;
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [navidromePlaylists, setNavidromePlaylists] = useState<PlaylistEntry[]>([]);

    const isStage = Boolean(song && (song as any).isStage === true);
    const isNavidrome = Boolean(song && (song as any).isNavidrome === true);
    const isLocal = Boolean(song && !isNavidrome && (((song as any).isLocal === true) || Boolean((song as any).localRef?.songId)));
    const playbackSourceRef = song ? getPlaybackSourceRef(song) : null;
    const isOnline = playbackSourceRef?.kind === 'online';
    const onlineProviderLabel = playbackSourceRef?.kind === 'online'
        ? omni.getProviderLabel(playbackSourceRef.providerId)
        : '';
    const canAddOnlineSong = Boolean(currentSong && isOnline && omni.canAddSongToPlaylist(currentSong));

    const refreshNavidromePlaylists = useCallback(async () => {
        const { getNavidromeConfig, navidromeApi } = await import('../../services/navidromeService');
        const config = getNavidromeConfig();
        if (!config) {
            setNavidromePlaylists([]);
            return;
        }

        const playlists = await navidromeApi.getPlaylists(config);
        setNavidromePlaylists(playlists.map((playlist) => ({
            id: playlist.id,
            name: playlist.name,
            description: `${playlist.songCount} ${t('playlist.tracks')}`,
        })));
    }, [t]);

    useEffect(() => {
        if (!isNavidrome) {
            setNavidromePlaylists([]);
            return;
        }

        void refreshNavidromePlaylists();
    }, [currentSong?.id, isNavidrome, refreshNavidromePlaylists]);

    const availablePlaylists = useMemo<PlaylistEntry[]>(() => {
        if (isLocal) {
            return localPlaylists.map((playlist) => ({
                id: playlist.id,
                name: playlist.name,
                description: `${playlist.songIds.length} ${t('playlist.tracks')}`,
            }));
        }

        if (isOnline) {
            return onlinePlaylists.map((playlist) => ({
                id: String(playlist.id),
                name: playlist.name,
                description: `${playlist.trackCount || 0} ${t('playlist.tracks')}`,
            }));
        }

        if (isNavidrome) {
            return navidromePlaylists;
        }

        return [];
    }, [isLocal, isOnline, isNavidrome, localPlaylists, navidromePlaylists, onlinePlaylists, t]);

    const isApplicable = Boolean(song && !isStage && (isLocal || isOnline || isNavidrome));
    // Local and Navidrome can make a playlist on the spot, so having none is not a refusal there.
    const canAdd = (isLocal)
        || (isOnline && canAddOnlineSong && onlinePlaylists.length > 0)
        || (isNavidrome);
    const disabledReason = isOnline && !canAddOnlineSong
        ? t('status.providerPlaylistMutationUnavailable', { provider: onlineProviderLabel })
        : (!canAdd ? t('localMusic.noPlaylistsFound') : undefined);

    // The track can change under an open dialog — a blend lands, the queue advances — and the new
    // one may have nowhere to go. Closing beats leaving a picker up that cannot pick.
    useEffect(() => {
        if (isOpen && !(isApplicable && canAdd)) {
            close();
        }
    }, [canAdd, close, isApplicable, isOpen]);

    // Published rather than recomputed by each consumer: the star button and the command both need
    // this answer, and only one of them can afford to be the thing that fetches it.
    useEffect(() => {
        setAvailability({ isApplicable, canAdd: isApplicable && canAdd, disabledReason });
    }, [canAdd, disabledReason, isApplicable, setAvailability]);

    return (
        <div className="pointer-events-auto">
            <PlaylistSelectionDialog
                isOpen={isOpen}
                onClose={close}
                isDaylight={isDaylight}
                title={t('localMusic.addToPlaylist')}
                description={t('home.playlists') || 'Playlists'}
                playlists={availablePlaylists}
                onSelect={async (playlistId) => {
                    if (isLocal) {
                        // 本地分支直连歌单服务：目标歌曲可能不是正在播放的那首。
                        const songId = (song as any).localRef?.songId as string | undefined;
                        if (!songId) throw new Error('Selected song is not a local track');
                        const playlist = localPlaylists.find(item => item.id === String(playlistId));
                        if (!playlist) throw new Error('Selected playlist is unavailable');
                        if (playlist.songIds.includes(songId)) {
                            setStatusMessage({ type: 'info', text: t('localMusic.songAlreadyInPlaylist', { name: playlist.name }) });
                            return;
                        }
                        await addLocalSongIdsToPlaylist(playlist.id, [songId]);
                        window.dispatchEvent(new Event(LOCAL_MUSIC_UPDATED_EVENT));
                        setStatusMessage({ type: 'success', text: t('localMusic.addedToPlaylist', { name: playlist.name }) });
                        return;
                    }

                    if (isOnline) {
                        const playlist = onlinePlaylists.find(item => String(item.id) === String(playlistId));
                        if (!playlist) throw new Error('Selected playlist is unavailable');
                        await onAddCurrentSongToOnlinePlaylist(playlist);
                        return;
                    }

                    if (isNavidrome) {
                        await onAddCurrentSongToNavidromePlaylist(String(playlistId));
                        await refreshNavidromePlaylists();
                    }
                }}
                onCreate={(isLocal || isNavidrome) ? () => {
                    close();
                    setIsCreateOpen(true);
                } : undefined}
                // 已在歌单里的本地歌单照常可点（服务端幂等去重），反馈用轻提示。
                existingSongId={isLocal ? ((song as any).localRef?.songId as string | undefined) : undefined}
                playlistSongIds={isLocal
                    ? Object.fromEntries(localPlaylists.map(playlist => [playlist.id, playlist.songIds]))
                    : undefined}
                createLabel={t(isNavidrome ? 'navidrome.createPlaylist' : 'localMusic.createPlaylist')}
            />

            <TextInputDialog
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                isDaylight={isDaylight}
                title={t(isNavidrome ? 'navidrome.createPlaylist' : 'localMusic.createPlaylist')}
                description={t('localMusic.enterPlaylistName')}
                placeholder={t('localMusic.enterPlaylistName')}
                confirmLabel={t('options.save')}
                onConfirm={async (name) => {
                    if (isLocal) {
                        const songId = (song as any).localRef?.songId as string | undefined;
                        if (!songId) throw new Error('Selected song is not a local track');
                        const created = await createLocalPlaylistWithSongIds(name, [songId]);
                        window.dispatchEvent(new Event(LOCAL_MUSIC_UPDATED_EVENT));
                        setStatusMessage({ type: 'success', text: t('localMusic.addedToPlaylist', { name: created.name }) });
                        return;
                    }

                    if (isNavidrome) {
                        await onCreateCurrentNavidromePlaylist(name);
                        await refreshNavidromePlaylists();
                    }
                }}
            />
        </div>
    );
};

export default AddToPlaylistHost;

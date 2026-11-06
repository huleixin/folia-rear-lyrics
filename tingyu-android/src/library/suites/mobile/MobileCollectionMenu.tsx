import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryCollectionSurfaceProps } from '../../core/contracts/suite';
import type { SongResult } from '../../../types';
import type { LibraryMutationResult } from '../../core/contracts/mutations';
import { resolveTrackAlbumLink, resolveTrackArtistLinks } from '../../core/model/trackLinks';
import { canResolveSongCatalogRef } from '../../../services/onlineMusic/catalogRefs';
import { playlistSongIdOf } from '../../../utils/localPlaylistView';
import { openAddToPlaylistForSong } from '../../../stores/useAddToPlaylistStore';
import { setStatusMessage } from '../../../stores/useStatusMessageStore';
import { LOCAL_MUSIC_UPDATED_EVENT } from '../../../services/localMusicService';
import {
    getFavoriteLocalPlaylist,
    reorderLocalPlaylistSongs,
    resolveCanonicalLocalSongId,
    setLocalSongIdFavorite,
} from '../../../services/localPlaylistService';
import type { useMobileCollection } from './useMobileCollection';
import MobileSheet from './MobileSheet';
import MobileCollectionSourceActions from './MobileCollectionSourceActions';

// src/library/suites/mobile/MobileCollectionMenu.tsx
export type MobileMenuTarget = { song: SongResult; index: number; entryKey: string } | 'collection';
type Model = ReturnType<typeof useMobileCollection>;
export default function MobileCollectionMenu({
    props,
    model,
    target,
    onClose,
    onOpenManage,
}: {
    props: LibraryCollectionSurfaceProps;
    model: Model;
    target: MobileMenuTarget;
    onClose: () => void;
    /** 本地歌单集合的「添加 / 管理歌曲」入口（面板由集合页挂载）。 */
    onOpenManage?: () => void;
}) {
    const { t } = useTranslation();
    const [prompt, setPrompt] = useState<{
        label: string;
        initial: string;
        confirm: boolean;
        run: (value: string) => Promise<LibraryMutationResult>;
    } | null>(null);
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const mutations = props.mutations;
    const caps = model.mutations.capabilities;
    // 阶段二：本地歌的收藏状态与歌内位置能力。
    const localSongId = target !== 'collection'
        ? ((target.song as { localRef?: { songId?: string } }).localRef?.songId ?? null)
        : null;
    const [liked, setLiked] = useState<boolean | null>(null);
    useEffect(() => {
        if (target === 'collection' || !localSongId) {
            setLiked(null);
            return;
        }
        let alive = true;
        void getFavoriteLocalPlaylist().then(favorite => {
            if (!alive) return;
            const canonical = resolveCanonicalLocalSongId(localSongId, props.localSongs);
            setLiked(favorite.songIds.includes(canonical));
        });
        return () => { alive = false; };
    }, [localSongId, props.localSongs, target]);
    const toggleLiked = async () => {
        if (!localSongId || liked === null) return;
        const next = !liked;
        try {
            await setLocalSongIdFavorite(localSongId, next);
            window.dispatchEvent(new Event(LOCAL_MUSIC_UPDATED_EVENT));
            setLiked(next);
            setStatusMessage({ type: 'success', text: t(next ? 'status.liked' : 'status.unliked') });
        } catch (error) {
            console.warn('[MobileCollectionMenu] Failed to toggle favorite:', error);
            setStatusMessage({ type: 'error', text: t('status.likeFailed') });
        }
    };
    // 歌单内手动调序：仅本地歌单 + 默认顺序。直接写存储顺序（songIds），换排序方式不会动它。
    const canMoveInPlaylist = target !== 'collection'
        && model.playlistSort.supported
        && model.playlistSort.field === 'default';
    const moveInPlaylist = async (delta: number) => {
        if (target === 'collection') return;
        const playlistId = (props.collection as { playlistId?: string }).playlistId;
        if (!playlistId) return;
        const ids = model.view.displayTracks.map(track => playlistSongIdOf(track));
        const to = target.index + delta;
        if (to < 0 || to >= ids.length) return;
        const next = [...ids];
        const [moved] = next.splice(target.index, 1);
        next.splice(to, 0, moved);
        try {
            await reorderLocalPlaylistSongs(playlistId, next);
            window.dispatchEvent(new Event(LOCAL_MUSIC_UPDATED_EVENT));
            model.actions.reload();
            onClose();
        } catch (error) {
            console.warn('[MobileCollectionMenu] Failed to reorder playlist:', error);
            setStatusMessage({ type: 'error', text: t('mobileLibrary.actionFailed') });
        }
    };
    // 本地歌单集合的菜单分支条件（与 collectionMutationCapabilities 的判定一致）。
    const isLocalPlaylistCollection = props.collection.source === 'local'
        && props.collection.type === 'playlist'
        && Boolean((props.collection as { playlistId?: string }).playlistId)
        && !(props.collection as { isVirtual?: boolean }).isVirtual;
    const run = async (action: () => Promise<LibraryMutationResult>, done?: () => void) => {
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            const result = await action();
            if (result.ok) {
                onClose();
                done?.();
            } else setError(result.message || t('mobileLibrary.actionFailed'));
        } catch {
            setError(t('mobileLibrary.actionFailed'));
        } finally {
            setBusy(false);
        }
    };
    const ask = (
        label: string,
        initial: string,
        confirm: boolean,
        action: (value: string) => Promise<LibraryMutationResult>
    ) => {
        setPrompt({ label, initial, confirm, run: action });
        setValue(initial);
    };
    const button = (label: string, action: () => void, disabled = false) => (
        <button className="ml-sheet-action" disabled={busy || disabled} onClick={action}>
            {label}
        </button>
    );
    const tracks = target === 'collection' ? model.view.contextTracks : [target.song];
    const album = target !== 'collection' ? resolveTrackAlbumLink(target.song, canResolveSongCatalogRef) : null;
    const artists = target !== 'collection' ? resolveTrackArtistLinks(target.song, canResolveSongCatalogRef) : [];
    return (
        <MobileSheet
            title={prompt?.label || (target === 'collection' ? t('mobileLibrary.playlistActions') : target.song.name)}
            onClose={onClose}
        >
            {prompt ? (
                <form
                    className="ml-prompt"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void run(() => prompt.run(value));
                    }}
                >
                    {prompt.confirm ? (
                        <p>{t('mobileLibrary.confirmRemoval')}</p>
                    ) : (
                        <input
                            autoFocus
                            aria-label={prompt.label}
                            value={value}
                            onChange={(event) => setValue(event.target.value)}
                        />
                    )}
                    <button className="ml-solid" disabled={busy || (!prompt.confirm && !value.trim())}>
                        {t('mobileLibrary.confirm')}
                    </button>
                    <button type="button" className="ml-text-button" disabled={busy} onClick={() => setPrompt(null)}>
                        {t('mobileLibrary.cancel')}
                    </button>
                </form>
            ) : (
                <>
                    {button(t('mobileLibrary.enqueue'), () => {
                        target === 'collection'
                            ? model.actions.enqueueScope()
                            : model.actions.enqueueTrack(target.song);
                        onClose();
                    })}
                    {target === 'collection' && isLocalPlaylistCollection && onOpenManage &&
                        button(
                            t('mobileLibrary.manageSongs'),
                            () => {
                                onOpenManage();
                            }
                        )}
                    {target === 'collection' && model.playlistSort.supported && (
                        <div className="ml-prompt">
                            <label>
                                {t('mobileLibrary.playlistSort')}
                                <select
                                    value={model.playlistSort.field}
                                    onChange={(event) => model.playlistSort.actions.setField(event.target.value as typeof model.playlistSort.field)}
                                >
                                    <option value="default">{t('mobileLibrary.sortDefaultOrder')}</option>
                                    <option value="name">{t('mobileLibrary.sortByName')}</option>
                                    <option value="artist">{t('mobileLibrary.sortByArtist')}</option>
                                    <option value="addedAt">{t('mobileLibrary.sortByAddedAt')}</option>
                                </select>
                            </label>
                            {model.playlistSort.field !== 'default' && (
                                <button
                                    className="ml-sheet-action"
                                    onClick={() => model.playlistSort.actions.setDirection(model.playlistSort.direction === 'asc' ? 'desc' : 'asc')}
                                >
                                    {t(model.playlistSort.direction === 'asc' ? 'mobileLibrary.ascending' : 'mobileLibrary.descending')}
                                </button>
                            )}
                        </div>
                    )}
                    {target === 'collection' && (
                        <MobileCollectionSourceActions
                            props={props}
                            model={model}
                            commands={{ button, ask, run, busy, onClose }}
                        />
                    )}
                    {target !== 'collection' && (
                        <>
                            {localSongId &&
                                button(
                                    t('localMusic.addToPlaylist'),
                                    () => {
                                        openAddToPlaylistForSong(target.song);
                                        onClose();
                                    }
                                )}
                            {localSongId && liked !== null &&
                                button(
                                    t(liked ? 'mobileLibrary.unlikeSong' : 'mobileLibrary.likeSong'),
                                    () => void toggleLiked()
                                )}
                            {canMoveInPlaylist &&
                                button(
                                    t('mobileLibrary.moveUp'),
                                    () => void moveInPlaylist(-1),
                                    target.index === 0
                                )}
                            {canMoveInPlaylist &&
                                button(
                                    t('mobileLibrary.moveDown'),
                                    () => void moveInPlaylist(1),
                                    target.index >= model.view.displayTracks.length - 1
                                )}
                            {album &&
                                button(t('mobileLibrary.openAlbum'), () => {
                                    props.onOpenAlbum(album.targetId, { ...album.album }, target.song);
                                    onClose();
                                })}
                            {artists
                                .filter((link) => link.targetId != null)
                                .map((link) => (
                                    <React.Fragment key={link.targetId}>
                                        {button(`${t('mobileLibrary.openArtist')} · ${link.artist.name}`, () => {
                                            props.onOpenArtist(link.targetId!, { ...link.artist }, target.song);
                                            onClose();
                                        })}
                                    </React.Fragment>
                                ))}
                            {caps.matchSong.supported &&
                                button(
                                    t('mobileLibrary.matchSong'),
                                    () => void run(() => mutations!.matchSong(target.song)),
                                    !caps.matchSong.enabled
                                )}
                            {caps.removeEntry.supported &&
                                button(
                                    t('mobileLibrary.removeTrack'),
                                    () =>
                                        ask(t('mobileLibrary.removeTrack'), '', true, () =>
                                            mutations!.removeEntry({ track: target.song, entryKey: target.entryKey })
                                        ),
                                    !caps.removeEntry.enabled ||
                                        model.mutations.pendingEntryKeys.includes(target.entryKey)
                                )}
                        </>
                    )}
                    {caps.addToPlaylist.supported && (
                        <div className="ml-prompt">
                            <label>
                                {t('mobileLibrary.addToPlaylist')}
                                <select
                                    defaultValue=""
                                    disabled={busy || !caps.addToPlaylist.enabled}
                                    onChange={(event) => {
                                        if (event.target.value)
                                            void run(() => mutations!.addToPlaylist(event.target.value, tracks));
                                    }}
                                >
                                    <option value="" disabled>
                                        {t('mobileLibrary.choosePlaylist')}
                                    </option>
                                    {model.mutations.availablePlaylists.map((playlist) => (
                                        <option key={playlist.id} value={playlist.id}>
                                            {playlist.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    )}
                    {caps.createPlaylist.supported &&
                        button(
                            t('mobileLibrary.createPlaylist'),
                            () =>
                                ask(t('mobileLibrary.createPlaylist'), '', false, (name) =>
                                    mutations!.createPlaylist(name, tracks)
                                ),
                            !caps.createPlaylist.enabled
                        )}
                </>
            )}
            {error && (
                <p className="ml-error" role="alert">
                    {error}
                </p>
            )}
        </MobileSheet>
    );
}

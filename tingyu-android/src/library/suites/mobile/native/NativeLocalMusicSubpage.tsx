import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { LibraryHomeSurfaceProps } from '../../../core/contracts/suite';
import { useLibraryHomeLocal } from '../../../core/bindings/useLibraryHomeLocal';
import { useLibraryHomeActions } from '../../../core/bindings/useLibraryHomeActions';
import { buildMusicFolders, folderAt } from '../../../core/model/localFolderTree';
import type { LocalHomeSectionKey } from '../../../core/model/localHomeModel';
import type { NativePageModel, PageActions, PageSection } from '../../../../types/nativePages';
import { useNativePage } from '../../../../hooks/useNativePage';
import { NATIVE_FIRST, absolutePageImage } from '../../../../services/nativePages';
import { buildLocalQueue, LIST_ROW_COVER_SIZE } from '../../../../services/playbackAdapters';
import { getSongArtistLabel, getSongCoverUrl } from '../../../../services/onlineMusic/songMetadata';
import { catalogBadgePageFields } from '../../../../utils/catalogAudioLabels';
import { useLibraryTrackPlayback } from '../../../../hooks/useLibraryTrackPlayback';
import { useLocalTrackSortStore } from '../../../core/state/useLocalTrackSortStore';
import { sortLocalFolderSongs, type LocalSongFolderSortField } from '../../../../utils/localSongSorting';
import { usePlaybackStore } from '../../../../stores/usePlaybackStore';
import { PlayerState, type LocalSong, type SongResult } from '../../../../types';
import { getFavoriteLocalPlaylist, setLocalSongIdFavorite } from '../../../../services/localPlaylistService';
import { openAddToPlaylistForSong } from '../../../../stores/useAddToPlaylistStore';
import { LOCAL_MUSIC_UPDATED_EVENT } from '../../../../services/localMusicService';
import { setStatusMessage } from '../../../../stores/useStatusMessageStore';
import { pageRowActions } from '../../../../utils/nativePageActions';
import { useModalBackHandler } from '../../../../hooks/useModalBackHandler';
import { useCollectionNavigationStore } from '../../../../stores/useCollectionNavigationStore';
import { useAppViewStore } from '../../../../stores/useAppViewStore';
import { useSettingsModalStore } from '../../../../stores/useSettingsModalStore';
import { useSearchNavigationStore } from '../../../../stores/useSearchNavigationStore';
import MobileSheet from '../../../../components/shared/MobileSheet';
import { MobileLocalTools } from '../MobileHomeSources';
import LocalSongActionSheet, { type LocalSongMenu } from './LocalSongActionSheet';

// src/library/suites/mobile/native/NativeLocalMusicSubpage.tsx

const formatPageDuration = (ms: number | undefined): string => {
    if (!Number.isFinite(ms) || ms === undefined || ms <= 0) return '--:--';
    const total = Math.floor(ms / 1000);
    const seconds = String(total % 60).padStart(2, '0');
    const minutes = Math.floor(total / 60) % 60;
    const hours = Math.floor(total / 3600);
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
};

const CATEGORY_TABS: ReadonlyArray<{ key: LocalHomeSectionKey; label: string }> = [
    { key: 'songs', label: '歌曲' },
    { key: 'folders', label: '文件夹' },
    { key: 'albums', label: '专辑' },
    { key: 'artists', label: '歌手' },
    { key: 'playlists', label: '歌单' },
];

function shuffleArray<T>(list: readonly T[]): T[] {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

export default function NativeLocalMusicSubpage({
    props,
    open,
    onClose,
}: {
    props: LibraryHomeSurfaceProps;
    open: boolean;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const anchorRef = useRef<HTMLDivElement>(null);
    const hasCollectionStack = useCollectionNavigationStore(s => Boolean(s.snapshot?.stack.length));
    const browsing = useAppViewStore(s => s.view !== 'player');
    const settingsOpen = useSettingsModalStore(s => s.settingsModalState.isOpen);
    const searchOpen = useSearchNavigationStore(s => s.isSearchOpen);
    const interactive = NATIVE_FIRST
        ? open && !hasCollectionStack && browsing && !settingsOpen && !searchOpen
        : open && !hasCollectionStack;

    const { importBusy } = useLibraryHomeActions(props.homeResources.actions);
    const local = useLibraryHomeLocal({
        localSongs: props.localSongs,
        localPlaylists: props.localPlaylists,
        catalog: props.localLibraryCatalog,
        activeRow: props.localMusicState.activeRow,
    });

    const [tab, setTab] = useState<LocalHomeSectionKey>('songs');
    const [path, setPath] = useState('');
    const [query, setQuery] = useState('');
    const [songOffset, setSongOffset] = useState(0);
    const [manageOpen, setManageOpen] = useState(false);
    const [menu, setMenu] = useState<LocalSongMenu | null>(null);
    const [menuLiked, setMenuLiked] = useState<boolean | null>(null);
    const [favoriteCount, setFavoriteCount] = useState(0);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const syncFav = () => {
            void getFavoriteLocalPlaylist().then(fav => {
                if (!cancelled) {
                    const existingIds = new Set(props.localSongs.map(s => s.id));
                    setFavoriteCount(fav.songIds.filter(id => existingIds.has(id)).length);
                }
            }).catch(() => {});
        };
        syncFav();
        window.addEventListener(LOCAL_MUSIC_UPDATED_EVENT, syncFav);
        return () => {
            cancelled = true;
            window.removeEventListener(LOCAL_MUSIC_UPDATED_EVENT, syncFav);
        };
    }, [open, props.localSongs]);

    const tree = useMemo(() => buildMusicFolders(props.localSongs), [props.localSongs]);
    const folder = useMemo(() => folderAt(tree, path), [tree, path]);

    const sortField = useLocalTrackSortStore(state => state.field);
    const sortDirection = useLocalTrackSortStore(state => state.direction);
    const setSortField = useLocalTrackSortStore(state => state.setField);
    const setSortDirection = useLocalTrackSortStore(state => state.setDirection);

    const isSongsTab = tab === 'songs';
    const isFoldersTab = tab === 'folders';

    const rawSongs = useMemo(() => {
        if (isSongsTab) return sortLocalFolderSongs(props.localSongs, sortField, sortDirection);
        if (isFoldersTab) return sortLocalFolderSongs(folder.songs, sortField, sortDirection);
        return sortLocalFolderSongs(props.localSongs, sortField, sortDirection);
    }, [isSongsTab, isFoldersTab, props.localSongs, folder.songs, sortField, sortDirection]);

    const allQueueTracks = useMemo(
        () => buildLocalQueue(sortLocalFolderSongs(props.localSongs, sortField, sortDirection), undefined, props.localLibraryCatalog, LIST_ROW_COVER_SIZE),
        [props.localSongs, sortField, sortDirection, props.localLibraryCatalog],
    );

    const scopeTracks = useMemo(
        () => (isSongsTab ? allQueueTracks : buildLocalQueue(rawSongs, undefined, props.localLibraryCatalog, LIST_ROW_COVER_SIZE)),
        [isSongsTab, allQueueTracks, rawSongs, props.localLibraryCatalog],
    );

    const play = useLibraryTrackPlayback(props.onPlaySong, props.onTogglePlayback);
    const currentSongId = (usePlaybackStore(s => s.currentSong) as unknown as { localRef?: { songId?: string } } | null)?.localRef?.songId;
    const playing = usePlaybackStore(s => s.playerState === PlayerState.PLAYING);

    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filteredSongs = useMemo(() => {
        if (!normalizedQuery) return scopeTracks;
        return scopeTracks.filter(song => {
            const album = song.album?.name ?? '';
            return `${song.name} ${getSongArtistLabel(song)} ${album}`.toLocaleLowerCase().includes(normalizedQuery);
        });
    }, [scopeTracks, normalizedQuery]);

    useEffect(() => {
        setSongOffset(0);
    }, [tab, path, normalizedQuery, sortField, sortDirection]);

    const handleBack = useCallback(() => {
        if (tab === 'folders' && folder.path) {
            const parts = folder.path.split('/').filter(Boolean);
            setPath(parts.slice(0, -1).join('/'));
            return;
        }
        onClose();
    }, [tab, folder.path, onClose]);

    useModalBackHandler(interactive, handleBack);

    const albumSection = local.sections.find(s => s.key === 'albums');
    const artistSection = local.sections.find(s => s.key === 'artists');
    const playlistSection = local.sections.find(s => s.key === 'playlists');
    const topFolderCount = tree.children.size || (props.localSongs.length > 0 ? 1 : 0);
    const albumCount = albumSection?.groups.length ?? 0;
    const artistCount = artistSection?.groups.length ?? 0;
    const playlistCount = playlistSection?.groups.length ?? 0;

    const activePlayableQueue = (isSongsTab || isFoldersTab) && filteredSongs.length > 0
        ? filteredSongs
        : allQueueTracks;

    const openSongMenu = useCallback((song: SongResult) => {
        setMenu({ song, queue: activePlayableQueue.length > 0 ? activePlayableQueue : scopeTracks });
        const songId = (song as unknown as { localRef?: { songId?: string } }).localRef?.songId;
        if (!songId) {
            setMenuLiked(null);
            return;
        }
        void getFavoriteLocalPlaylist().then(favorite => {
            setMenuLiked(favorite.songIds.includes(songId));
        });
    }, [activePlayableQueue, scopeTracks]);

    const actions: PageActions = {
        back: handleBack,
        exit: onClose,
        manage: () => setManageOpen(true),
        filter: e => { setQuery(e.text ?? ''); setSongOffset(0); },
        songRange: e => setSongOffset(Math.max(0, Math.floor((e.value ?? 0) / 100) * 100)),
        'play-all': () => {
            if (activePlayableQueue.length > 0) play(activePlayableQueue[0], activePlayableQueue);
        },
        'shuffle-all': () => {
            if (activePlayableQueue.length > 0) {
                const shuffled = shuffleArray(activePlayableQueue);
                play(shuffled[0], shuffled);
            }
        },
        parent: () => {
            const parts = folder.path.split('/').filter(Boolean);
            setPath(parts.slice(0, -1).join('/'));
        },
        'toggle-sort-dir': () => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'),
    };

    CATEGORY_TABS.forEach(entry => {
        actions[`tab:${entry.key}`] = () => {
            setTab(entry.key);
            if (entry.key !== 'folders') setPath('');
        };
    });

    const sortFields: Array<{ field: LocalSongFolderSortField; label: string }> = [
        { field: 'fileName', label: '按文件名' },
        { field: 'fileLastModified', label: '按修改时间' },
        { field: 'albumTrack', label: '按专辑曲目' },
    ];
    sortFields.forEach(({ field }) => {
        actions[`sort:${field}`] = () => {
            if (sortField === field) {
                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
            } else {
                setSortField(field);
            }
        };
    });

    const overviewSubtitle = `${topFolderCount} 个文件夹 · ${albumCount} 张专辑 · ${artistCount} 位歌手 · ${playlistCount} 个歌单`;
    const overviewMeta = importBusy
        ? '正在扫描与同步本地目录…'
        : favoriteCount > 0
            ? `已收藏 ${favoriteCount} 首本地音乐 · 支持无损离线直连`
            : '本机音频文件 · 离线无损直连播放';

    const sections: PageSection[] = [
        {
            id: 'overview',
            layout: 'rows',
            total: props.localSongs.length,
            description: overviewSubtitle,
            text: overviewMeta,
            items: [
                { id: 'play-all', title: '播放全部', action: 'play-all', disabled: props.localSongs.length === 0 },
                { id: 'shuffle-all', title: '随机播放', action: 'shuffle-all', disabled: props.localSongs.length === 0 },
                { id: 'manage', title: '目录管理', action: 'manage' },
            ],
        },
        {
            id: 'categories',
            layout: 'chips',
            items: CATEGORY_TABS.map(entry => ({
                id: entry.key,
                title: entry.label,
                selected: tab === entry.key,
                action: `tab:${entry.key}`,
            })),
        },
        {
            id: 'filter',
            layout: 'input',
            value: query,
            placeholder: '搜索本地歌曲、专辑、歌手或歌单',
            action: 'filter',
        },
    ];

    if (isSongsTab || isFoldersTab) {
        const childFolders = isFoldersTab
            ? Array.from(folder.children.values()).filter(child =>
                !normalizedQuery || `${child.name} ${child.path}`.toLocaleLowerCase().includes(normalizedQuery),
            )
            : [];

        childFolders.forEach(child => {
            actions[`open-folder:${child.path}`] = () => setPath(child.path);
        });

        const countLabel = isSongsTab
            ? `共 ${filteredSongs.length} 首歌曲`
            : folder.path
                ? `${folder.name || folder.path} · ${childFolders.length ? `${childFolders.length} 个子目录 · ` : ''}${filteredSongs.length} 首`
                : `共 ${childFolders.length} 个文件夹${filteredSongs.length ? ` · 根目录 ${filteredSongs.length} 首` : ''}`;

        sections.push({
            id: 'subheader',
            layout: 'chips',
            title: countLabel,
            description: isFoldersTab && folder.path ? folder.path : '',
            more: isFoldersTab && folder.path ? 'parent' : '',
            moreLabel: '返回上一级',
            items: (filteredSongs.length > 0 || props.localSongs.length > 0)
                ? sortFields.map(({ field, label }) => ({
                    id: field,
                    title: sortField === field ? `${label}${sortDirection === 'asc' ? ' ↑' : ' ↓'}` : label,
                    selected: sortField === field,
                    action: `sort:${field}`,
                }))
                : [],
        });

        if (isFoldersTab && childFolders.length > 0) {
            sections.push({
                id: 'folder-groups',
                layout: 'rows',
                total: childFolders.length,
                items: childFolders.map(child => ({
                    id: `folder:${child.path}`,
                    title: child.name,
                    subtitle: `${child.count} 首歌曲 · ${child.path}`,
                    image: 'glyph:folder-open',
                    action: `open-folder:${child.path}`,
                })),
            });
        }

        if (filteredSongs.length > 0) {
            sections.push({
                id: 'local-songs',
                title: isFoldersTab ? `当前目录歌曲 · ${filteredSongs.length}` : '',
                layout: 'rows',
                key: `${tab}:${path}:${normalizedQuery}:${sortField}:${sortDirection}`,
                playing,
                total: filteredSongs.length,
                offset: songOffset,
                request: 'songRange',
                items: filteredSongs.slice(songOffset, songOffset + 100).map((song, localIdx) => {
                    const absIndex = songOffset + localIdx;
                    const artist = getSongArtistLabel(song);
                    const album = song.album?.name?.trim();
                    const subtitle = album && album !== artist ? `${artist} · ${album}` : artist;
                    const localSongId = (song as unknown as { localRef?: { songId?: string } }).localRef?.songId;
                    return {
                        ...catalogBadgePageFields(song, t, true),
                        id: `local-song:${absIndex}:${song.id}`,
                        title: song.name,
                        subtitle,
                        duration: formatPageDuration(
                            (song as unknown as { durationMs?: number; duration?: number }).durationMs
                            ?? (song as unknown as { duration?: number }).duration,
                        ),
                        image: absolutePageImage(getSongCoverUrl(song)),
                        action: `play-song:${absIndex}`,
                        secondary: `menu-song:${absIndex}`,
                        secondaryLabel: '更多操作',
                        selected: Boolean(currentSongId && localSongId === currentSongId),
                    };
                }),
            });
        } else if (!isFoldersTab || childFolders.length === 0) {
            sections.push({
                id: 'empty',
                layout: 'message',
                title: normalizedQuery ? '未找到匹配的本地音乐' : '暂无本地音乐',
                text: normalizedQuery
                    ? '可尝试其他关键词，或清空搜索条件查看全部本地曲库。'
                    : '扫描手机音频目录或导入音乐文件夹后，即可在此离线播放全部本地歌曲。',
                more: !normalizedQuery ? 'manage' : '',
                moreLabel: !normalizedQuery ? '扫描 / 导入本地音乐' : '',
            });
        }
    } else {
        const targetSection = local.sections.find(s => s.key === tab);
        const allGroups = targetSection?.groups ?? [];
        const indexedGroups = allGroups
            .map((group, idx) => ({ group, idx }))
            .filter(({ group }) => !normalizedQuery || `${group.name} ${group.description ?? ''}`.toLocaleLowerCase().includes(normalizedQuery));

        indexedGroups.forEach(({ group, idx }) => {
            actions[`open-group:${idx}`] = () => {
                props.homeResources.actions.openLocalGroup(group, props.onOpenGridView);
            };
        });

        const unitMap: Record<string, string> = {
            albums: `共 ${indexedGroups.length} 张专辑`,
            artists: `共 ${indexedGroups.length} 位歌手`,
            playlists: `共 ${indexedGroups.length} 个本地歌单`,
        };

        sections.push({
            id: 'subheader',
            layout: 'chips',
            title: unitMap[tab] ?? `共 ${indexedGroups.length} 项`,
            items: [],
        });

        if (indexedGroups.length > 0) {
            sections.push({
                id: 'local-groups',
                layout: 'rows',
                total: indexedGroups.length,
                items: indexedGroups.map(({ group, idx }) => {
                    const countText = `${group.trackCount ?? group.songs.length} 首`;
                    const desc = group.description?.trim();
                    const subtitle = desc ? `${desc} · ${countText}` : countText;
                    return {
                        id: `group:${group.id}`,
                        title: group.name,
                        subtitle,
                        image: (typeof group.coverUrl === 'string' ? absolutePageImage(group.coverUrl) : '')
                            || (tab === 'artists' ? 'glyph:user-round' : tab === 'playlists' ? 'glyph:list-music' : 'glyph:disc-3'),
                        action: `open-group:${idx}`,
                    };
                }),
            });
        } else {
            sections.push({
                id: 'empty',
                layout: 'message',
                title: normalizedQuery ? '未找到匹配内容' : (tab === 'playlists' ? '暂无本地歌单' : tab === 'albums' ? '暂无本地专辑' : '暂无本地歌手'),
                text: normalizedQuery
                    ? '请尝试更换搜索关键词。'
                    : '导入本地音乐后将自动按标签整理专辑、歌手与本地歌单。',
                more: props.localSongs.length === 0 ? 'manage' : '',
                moreLabel: props.localSongs.length === 0 ? '扫描 / 导入本地音乐' : '',
            });
        }
    }

    const model: NativePageModel | null = open
        ? {
            key: 'collection:local-music',
            title: '本地音乐',
            leading: 'back',
            trailing: 'manage',
            trailingLabel: '目录管理',
            trailingIcon: 'folder-cog',
            bottomClearance: 100,
            sections,
        }
        : null;

    const boundActions = pageRowActions(actions, id => {
        const playMatch = /^play-song:(\d+)$/.exec(id);
        if (playMatch) {
            const song = filteredSongs[Number(playMatch[1])];
            return song ? () => play(song, filteredSongs) : undefined;
        }
        const menuMatch = /^menu-song:(\d+)$/.exec(id);
        if (menuMatch) {
            const song = filteredSongs[Number(menuMatch[1])];
            return song ? () => openSongMenu(song) : undefined;
        }
        return undefined;
    });

    useNativePage(anchorRef, 'collection', interactive, model, boundActions);

    if (!open && !manageOpen && !menu) return null;

    return (
        <>
            {typeof document !== 'undefined' && open && createPortal(
                <div
                    ref={anchorRef}
                    aria-hidden="true"
                    style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: -1 }}
                />,
                document.body,
            )}

            {manageOpen && (
                <MobileSheet
                    title="本地音乐与目录管理"
                    subtitle={`当前已索引 ${props.localSongs.length} 首本地歌曲（移除目录不会删除手机音频文件）`}
                    onClose={() => setManageOpen(false)}
                >
                    <div className="pb-6">
                        <MobileLocalTools homeResources={props.homeResources} />
                    </div>
                </MobileSheet>
            )}

            {menu && (
                <LocalSongActionSheet
                    menu={menu}
                    liked={menuLiked}
                    onClose={() => setMenu(null)}
                    onPlay={() => {
                        if (!menu) return;
                        play(menu.song, menu.queue);
                        setMenu(null);
                    }}
                    onAddToPlaylist={() => {
                        if (!menu) return;
                        setMenu(null);
                        openAddToPlaylistForSong(menu.song);
                    }}
                    onToggleLike={() => {
                        const current = menu;
                        if (!current) return;
                        void (async () => {
                            const next = !(menuLiked === true);
                            try {
                                const songId = (current.song as unknown as { localRef?: { songId?: string } }).localRef?.songId;
                                if (!songId) return;
                                await setLocalSongIdFavorite(songId, next);
                                window.dispatchEvent(new Event(LOCAL_MUSIC_UPDATED_EVENT));
                                setMenuLiked(next);
                                setStatusMessage({ type: 'success', text: t(next ? 'status.liked' : 'status.unliked') });
                            } catch (error) {
                                console.warn('[NativeLocalMusicSubpage] Failed to toggle favorite:', error);
                                setStatusMessage({ type: 'error', text: t('status.likeFailed') });
                            }
                        })();
                    }}
                    onViewAlbum={() => {
                        const current = menu;
                        if (!current) return;
                        setMenu(null);
                        const songId = (current.song as unknown as { localRef?: { songId?: string } }).localRef?.songId;
                        const localSong = songId ? props.localSongs.find(candidate => candidate.id === songId) : undefined;
                        const albumName = localSong
                            ? (localSong.importedMetadata?.albumName || localSong.onlineMetadata?.album?.name || '')
                            : '';
                        const songs = albumName
                            ? props.localSongs.filter(candidate =>
                                (candidate.importedMetadata?.albumName || candidate.onlineMetadata?.album?.name || '') === albumName)
                            : [];
                        const fallback: LocalSong[] = localSong ? [localSong] : [];
                        props.homeResources.actions.openLocalGroup({
                            id: `album-${albumName || current.song.id}`,
                            type: 'album',
                            name: albumName || current.song.name,
                            songs: songs.length > 0 ? songs : fallback,
                            coverUrl: undefined,
                            trackCount: songs.length || 1,
                            description: localSong ? (localSong.importedMetadata?.artistNames ?? []).join(', ') : '',
                        }, props.onOpenGridView);
                    }}
                />
            )}
        </>
    );
}

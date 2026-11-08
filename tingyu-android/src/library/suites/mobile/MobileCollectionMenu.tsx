import React, { useEffect, useRef, useState } from 'react';
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
import OperationPanel, { type PanelActionPayload } from './native/OperationPanel';
import {
    buildCollectionSourcePanel,
    type MobileMenuCommands,
    type PanelHandlers,
} from './MobileCollectionSourceActions';
import type { NativePanelActionRow, NativePanelBlock, NativePanelModel } from '../../../types/nativePanels';

// src/library/suites/mobile/MobileCollectionMenu.tsx
//
// 歌单 / 歌曲的二级操作面板（原生化专项·第 21 轮）。
//
// 本文件从"直接吐 .ml-sheet DOM 的组件"改成**声明式模型 + 动作分派**：
//   · 面板里有什么、能不能点、当前选中哪一项，仍然由这里既有的业务状态算出；
//   · 怎么画交给 OperationPanel（Android 原生 / 其它平台 DOM，同一份 spec）；
//   · 点了哪一项回到下面 handlers 里原有的闭包 —— 加歌单、建歌单、收藏、移出、
//     调序、重命名、删除、重扫、导出、换音源全部走原来的服务，一行没重写。
//
// 与旧实现的差异只在"渲染器"：以前每个按钮都要写一遍 DOM 结构与禁用态，
// 现在同一件事写一次数据。加一个动作 = 加一个 row + 一个 handler。

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
    /** 每次 ask 都换一个块 id：原生输入框据此重建草稿，不会带上一次的残留。 */
    const promptSerial = useRef(0);
    const [promptKey, setPromptKey] = useState(0);
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
        promptSerial.current += 1;
        setPromptKey(promptSerial.current);
        setPrompt({ label, initial, confirm, run: action });
    };

    const tracks = target === 'collection' ? model.view.contextTracks : [target.song];
    const album = target !== 'collection' ? resolveTrackAlbumLink(target.song, canResolveSongCatalogRef) : null;
    const artists = target !== 'collection' ? resolveTrackArtistLinks(target.song, canResolveSongCatalogRef) : [];

    const blocks: NativePanelBlock[] = [];
    const handlers: PanelHandlers = {};

    if (prompt) {
        // 输入 / 二次确认是"整张面板换内容"，与旧实现的 prompt 分支等价。
        const blockId = `prompt:${promptKey}`;
        if (prompt.confirm) {
            handlers[blockId] = () => void run(() => prompt.run(''));
            blocks.push({
                kind: 'confirm', id: blockId, message: t('mobileLibrary.confirmRemoval'),
                confirmLabel: t('mobileLibrary.confirm'), cancelLabel: t('mobileLibrary.cancel'), tone: 'danger',
            });
        } else {
            handlers[blockId] = (payload?: PanelActionPayload) => void run(() => prompt.run(payload?.text ?? ''));
            blocks.push({
                kind: 'input', id: blockId, label: prompt.label, value: prompt.initial,
                confirmLabel: t('mobileLibrary.confirm'),
            });
        }
    } else if (target === 'collection') {
        // ---- 歌单级动作 ----
        const primary: NativePanelActionRow[] = [{
            id: 'enqueue', label: t('mobileLibrary.enqueue'), icon: 'plus',
        }];
        handlers.enqueue = () => { model.actions.enqueueScope(); onClose(); };
        if (isLocalPlaylistCollection && onOpenManage) {
            handlers.manageSongs = () => { onOpenManage(); };
            primary.push({ id: 'manageSongs', label: t('mobileLibrary.manageSongs'), icon: 'music2' });
        }
        blocks.push({ kind: 'actions', id: 'collection-primary', items: primary });

        // 歌单排序（与本地文件夹排序不是同一套能力）
        if (model.playlistSort.supported) {
            handlers.playlistSort = payload => {
                model.playlistSort.actions.setField(payload?.text as typeof model.playlistSort.field);
            };
            blocks.push({
                kind: 'select', id: 'playlistSort', label: t('mobileLibrary.playlistSort'),
                value: model.playlistSort.field,
                options: [
                    { value: 'default', label: t('mobileLibrary.sortDefaultOrder') },
                    { value: 'name', label: t('mobileLibrary.sortByName') },
                    { value: 'artist', label: t('mobileLibrary.sortByArtist') },
                    { value: 'addedAt', label: t('mobileLibrary.sortByAddedAt') },
                ],
            });
            if (model.playlistSort.field !== 'default') {
                handlers.playlistSortDirection = () =>
                    model.playlistSort.actions.setDirection(model.playlistSort.direction === 'asc' ? 'desc' : 'asc');
                blocks.push({
                    kind: 'actions', id: 'collection-sort-direction',
                    items: [{
                        id: 'playlistSortDirection',
                        label: t(model.playlistSort.direction === 'asc' ? 'mobileLibrary.ascending' : 'mobileLibrary.descending'),
                        icon: 'chevron-down',
                    }],
                });
            }
        }

        // 来源动作（重命名/删除/重扫/导出/编辑/每日推荐日期）
        const commands: MobileMenuCommands = { ask, run, busy, onClose };
        const source = buildCollectionSourcePanel({ props, model, commands, t });
        blocks.push(...source.blocks);
        Object.assign(handlers, source.handlers);
    } else {
        // ---- 歌曲级动作 ----
        const items: NativePanelActionRow[] = [];
        handlers.enqueue = () => { model.actions.enqueueTrack(target.song); onClose(); };
        items.push({ id: 'enqueue', label: t('mobileLibrary.enqueue'), icon: 'plus' });
        if (localSongId) {
            handlers.addToPlaylistSheet = () => { openAddToPlaylistForSong(target.song); onClose(); };
            items.push({ id: 'addToPlaylistSheet', label: t('localMusic.addToPlaylist'), icon: 'music2' });
        }
        if (localSongId && liked !== null) {
            handlers.toggleLiked = () => void toggleLiked();
            items.push({
                id: 'toggleLiked', icon: 'heart',
                label: t(liked ? 'mobileLibrary.unlikeSong' : 'mobileLibrary.likeSong'),
                selected: liked,
            });
        }
        if (canMoveInPlaylist) {
            handlers.moveUp = () => void moveInPlaylist(-1);
            handlers.moveDown = () => void moveInPlaylist(1);
            items.push({ id: 'moveUp', label: t('mobileLibrary.moveUp'), disabled: target.index === 0 });
            items.push({
                id: 'moveDown', label: t('mobileLibrary.moveDown'),
                disabled: target.index >= model.view.displayTracks.length - 1,
            });
        }
        if (album) {
            handlers.openAlbum = () => { props.onOpenAlbum(album.targetId, { ...album.album }, target.song); onClose(); };
            items.push({ id: 'openAlbum', label: t('mobileLibrary.openAlbum'), icon: 'disc-2' });
        }
        artists.filter(link => link.targetId != null).forEach(link => {
            const id = `openArtist:${link.targetId}`;
            handlers[id] = () => { props.onOpenArtist(link.targetId!, { ...link.artist }, target.song); onClose(); };
            items.push({ id, label: `${t('mobileLibrary.openArtist')} · ${link.artist.name}`, icon: 'user-round' });
        });
        if (caps.matchSong.supported) {
            handlers.matchSong = () => void run(() => mutations!.matchSong(target.song));
            items.push({ id: 'matchSong', label: t('mobileLibrary.matchSong'), disabled: !caps.matchSong.enabled, icon: 'sparkles' });
        }
        if (caps.removeEntry.supported) {
            handlers.removeEntry = () => ask(t('mobileLibrary.removeTrack'), '', true, () =>
                mutations!.removeEntry({ track: target.song, entryKey: target.entryKey }));
            items.push({
                id: 'removeEntry', label: t('mobileLibrary.removeTrack'), tone: 'danger', icon: 'trash2',
                disabled: !caps.removeEntry.enabled || model.mutations.pendingEntryKeys.includes(target.entryKey),
            });
        }
        blocks.push({ kind: 'actions', id: 'track-actions', items });

        // 加入歌单：选中即执行（与旧实现的 select onChange 一致）
        if (caps.addToPlaylist.supported) {
            handlers.addToPlaylist = payload => {
                if (payload?.text) void run(() => mutations!.addToPlaylist(payload.text!, tracks));
            };
            blocks.push({
                kind: 'select', id: 'addToPlaylist', label: t('mobileLibrary.addToPlaylist'), value: '',
                placeholder: t('mobileLibrary.choosePlaylist'),
                disabled: busy || !caps.addToPlaylist.enabled,
                options: model.mutations.availablePlaylists.map(playlist => ({ value: String(playlist.id), label: playlist.name })),
            });
        }
        if (caps.createPlaylist.supported) {
            handlers.createPlaylist = () =>
                ask(t('mobileLibrary.createPlaylist'), '', false, name => mutations!.createPlaylist(name, tracks));
            blocks.push({
                kind: 'actions', id: 'track-create',
                items: [{ id: 'createPlaylist', label: t('mobileLibrary.createPlaylist'), icon: 'plus', disabled: !caps.createPlaylist.enabled }],
            });
        }
    }

    const panel: NativePanelModel = {
        title: prompt?.label || (target === 'collection' ? t('mobileLibrary.playlistActions') : target.song.name),
        blocks,
        busy,
        error,
    };

    return (
        <OperationPanel
            panel={panel}
            onAction={(id, payload) => {
                const handler = handlers[id];
                if (handler) handler(payload);
                else console.warn('[MobileCollectionMenu] unhandled panel action', id);
            }}
            onClose={onClose}
            id="collection-menu"
        />
    );
}

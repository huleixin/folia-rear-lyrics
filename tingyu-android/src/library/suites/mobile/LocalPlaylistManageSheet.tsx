import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LocalPlaylist, LocalSong } from '../../../types';
import MobileArtwork from './MobileArtwork';
import { getLocalCoverAssetUrl } from '../../../services/localCoverAssetUrl';
import {
    addLocalSongIdsToPlaylist,
    getLocalPlaylists,
    removeSongsFromLocalPlaylist,
    reorderLocalPlaylistSongs,
} from '../../../services/localPlaylistService';
import { buildPlaylistAddCandidates } from '../../../utils/localPlaylistView';
import { setStatusMessage } from '../../../stores/useStatusMessageStore';
import { LOCAL_MUSIC_UPDATED_EVENT } from '../../../services/localMusicService';

// src/library/suites/mobile/LocalPlaylistManageSheet.tsx
/**
 * 本地歌单的「添加 / 管理歌曲」面板（阶段二）。
 *
 * 从歌单详情的集合菜单进入；两个页签：
 *  · 添加歌曲 —— 本地曲库里还不在该歌单中的歌，可搜索、可多选、可全选本结果，一次批量加入；
 *  · 移除与排序 —— 歌内歌曲可搜索、可多选批量移除；「默认顺序」下每首可上移/下移（写入存储顺序）。
 *
 * 全部走 localPlaylistService 既有能力（批量去重、事务式保存），完成后发
 * folia-local-music-updated 让曲库与「我喜欢」计数同步刷新。空歌单打开时默认在添加页签，
 * 这就是歌单空状态的添加入口。
 */
const localSongCover = (song: LocalSong): string | undefined => (
    song.useOnlineCover && song.onlineMetadata?.coverUrl
        ? song.onlineMetadata.coverUrl
        : getLocalCoverAssetUrl(song.localCoverAssetId, 512) || song.onlineMetadata?.coverUrl || undefined
);

export default function LocalPlaylistManageSheet({
    playlistId,
    localSongs,
    onClose,
    onReload,
}: {
    playlistId: string;
    localSongs: LocalSong[];
    onClose: () => void;
    /** 变更后让歌单详情资源重读。 */
    onReload: () => void;
}) {
    const { t } = useTranslation();
    const [mode, setMode] = useState<'add' | 'manage'>('add');
    const [playlist, setPlaylist] = useState<LocalPlaylist | null>(null);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let alive = true;
        void getLocalPlaylists().then(playlists => {
            if (!alive) return;
            setPlaylist(playlists.find(item => item.id === playlistId) ?? null);
        });
        return () => { alive = false; };
    }, [playlistId]);

    // 行数据：歌内歌按存储顺序；候选按歌名排序。歌已被删除的引用在此处自然消失
    //（getLocalPlaylists 会做 canonical 修复与失效清理），不会渲染成坏行。
    const songsById = useMemo(() => new Map(localSongs.map(song => [song.id, song])), [localSongs]);
    const memberSongs = useMemo(() => (
        (playlist?.songIds ?? [])
            .map(songId => songsById.get(songId))
            .filter((song): song is LocalSong => Boolean(song))
    ), [playlist?.songIds, songsById]);
    const candidates = useMemo(
        () => buildPlaylistAddCandidates(localSongs, playlist?.songIds ?? []),
        [localSongs, playlist?.songIds]
    );

    const needle = query.trim().toLowerCase();
    const filteredCandidates = useMemo(() => (
        needle ? candidates.filter(song => song.title.toLowerCase().includes(needle)) : candidates
    ), [candidates, needle]);
    const filteredMembers = useMemo(() => (
        needle ? memberSongs.filter(song => song.title.toLowerCase().includes(needle)) : memberSongs
    ), [memberSongs, needle]);

    const toggle = (songId: string) => {
        setSelected(previous => {
            const next = new Set(previous);
            if (next.has(songId)) next.delete(songId);
            else next.add(songId);
            return next;
        });
    };
    const selectAll = (ids: string[]) => setSelected(new Set(ids));
    const clearSelection = () => setSelected(new Set());

    const refreshAfterChange = () => {
        void getLocalPlaylists().then(playlists => {
            setPlaylist(playlists.find(item => item.id === playlistId) ?? null);
        });
        window.dispatchEvent(new Event(LOCAL_MUSIC_UPDATED_EVENT));
        onReload();
    };

    const addSelected = async () => {
        if (busy || selected.size === 0) return;
        setBusy(true);
        try {
            await addLocalSongIdsToPlaylist(playlistId, Array.from(selected));
            setSelected(new Set());
            setQuery('');
            setStatusMessage({ type: 'success', text: t('localMusic.addedCountToPlaylist', { count: selected.size }) });
            refreshAfterChange();
            setMode('manage');
        } catch (error) {
            console.warn('[LocalPlaylistManageSheet] Failed to add songs:', error);
            setStatusMessage({ type: 'error', text: t('mobileLibrary.actionFailed') });
        } finally {
            setBusy(false);
        }
    };

    const removeSelected = async () => {
        if (busy || selected.size === 0) return;
        setBusy(true);
        try {
            await removeSongsFromLocalPlaylist(playlistId, Array.from(selected));
            setSelected(new Set());
            setStatusMessage({ type: 'success', text: t('localMusic.removedCountFromPlaylist', { count: selected.size }) });
            refreshAfterChange();
        } catch (error) {
            console.warn('[LocalPlaylistManageSheet] Failed to remove songs:', error);
            setStatusMessage({ type: 'error', text: t('mobileLibrary.actionFailed') });
        } finally {
            setBusy(false);
        }
    };

    /** 上移/下移直接写存储顺序（songIds）。只在管理页签里出现，且永远按存储顺序操作。 */
    const moveSong = async (index: number, delta: number) => {
        if (!playlist || busy) return;
        const target = index + delta;
        if (target < 0 || target >= playlist.songIds.length) return;
        const next = [...playlist.songIds];
        const [moved] = next.splice(index, 1);
        next.splice(target, 0, moved);
        setBusy(true);
        try {
            await reorderLocalPlaylistSongs(playlistId, next);
            refreshAfterChange();
        } catch (error) {
            console.warn('[LocalPlaylistManageSheet] Failed to reorder:', error);
            setStatusMessage({ type: 'error', text: t('mobileLibrary.actionFailed') });
        } finally {
            setBusy(false);
        }
    };

    const rowClass = 'flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors';
    const rowTone = (isSelected: boolean) => isSelected
        ? 'border-transparent bg-[color:var(--ml-jade)]/15 ring-1 ring-[color:var(--ml-jade)]/40'
        : 'border-transparent hover:bg-white/[0.06]';

    return (
        <div className="ml-manage-playlist" data-folia-playlist-manage="true">
            <div className="ml-tabs" role="tablist" aria-label={t('mobileLibrary.manageSongs')}>
                <button role="tab" aria-selected={mode === 'add'} onClick={() => { setMode('add'); clearSelection(); }}>
                    {t('mobileLibrary.addSongsTab')}
                </button>
                <button role="tab" aria-selected={mode === 'manage'} onClick={() => { setMode('manage'); clearSelection(); }}>
                    {t('mobileLibrary.manageTab')}
                </button>
            </div>
            <input
                className="ml-filter"
                aria-label={t('mobileLibrary.searchSongs')}
                placeholder={t('mobileLibrary.searchSongs')}
                value={query}
                onChange={event => setQuery(event.currentTarget.value)}
            />
            {mode === 'add' ? (
                <>
                    <div className="flex items-center justify-between px-1 py-1 text-xs opacity-70">
                        <button className="ml-text-button" onClick={() => selectAll(filteredCandidates.map(song => song.id))}>
                            {t('mobileLibrary.selectAll')}
                        </button>
                        <button className="ml-text-button" onClick={clearSelection}>
                            {t('mobileLibrary.clearSelection')}
                        </button>
                    </div>
                    <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                        {filteredCandidates.map(song => {
                            const source = songsById.get(song.id);
                            return (
                                <button
                                    key={song.id}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => toggle(song.id)}
                                    className={`${rowClass} ${rowTone(selected.has(song.id))}`}
                                >
                                    <MobileArtwork src={source ? localSongCover(source) : undefined} className="!h-10 !w-10" />
                                    <span className="min-w-0 flex-1 truncate text-sm">{song.title}</span>
                                    <span className="shrink-0 text-xs opacity-60">{selected.has(song.id) ? '✓' : ''}</span>
                                </button>
                            );
                        })}
                        {filteredCandidates.length === 0 && (
                            <p className="px-2 py-6 text-center text-sm opacity-50">{t('mobileLibrary.noCandidates')}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        className="ml-solid mt-3 w-full"
                        disabled={busy || selected.size === 0}
                        onClick={() => void addSelected()}
                    >
                        {t('mobileLibrary.addCountToPlaylist', { count: selected.size })}
                    </button>
                </>
            ) : (
                <>
                    <div className="flex items-center justify-between px-1 py-1 text-xs opacity-70">
                        <button className="ml-text-button" onClick={() => selectAll(filteredMembers.map(song => song.id))}>
                            {t('mobileLibrary.selectAll')}
                        </button>
                        <button className="ml-text-button" onClick={clearSelection}>
                            {t('mobileLibrary.clearSelection')}
                        </button>
                    </div>
                    <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                        {filteredMembers.map((song, index) => (
                            <div key={song.id} className={`${rowClass} ${rowTone(selected.has(song.id))}`}>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => toggle(song.id)}
                                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                >
                                    <MobileArtwork src={localSongCover(song)} className="!h-10 !w-10" />
                                    <span className="min-w-0 flex-1 truncate text-sm">{song.title}</span>
                                    <span className="shrink-0 text-xs opacity-60">{selected.has(song.id) ? '✓' : ''}</span>
                                </button>
                                <span className="flex shrink-0 flex-col leading-none">
                                    <button
                                        type="button"
                                        aria-label={t('mobileLibrary.moveUp')}
                                        disabled={busy || index === 0}
                                        className="px-1 py-0.5 text-xs disabled:opacity-30"
                                        onClick={() => void moveSong(index, -1)}
                                    >▲</button>
                                    <button
                                        type="button"
                                        aria-label={t('mobileLibrary.moveDown')}
                                        disabled={busy || index === memberSongs.length - 1}
                                        className="px-1 py-0.5 text-xs disabled:opacity-30"
                                        onClick={() => void moveSong(index, 1)}
                                    >▼</button>
                                </span>
                            </div>
                        ))}
                        {filteredMembers.length === 0 && (
                            <p className="px-2 py-6 text-center text-sm opacity-50">
                                {t(playlist && playlist.songIds.length > 0 ? 'mobileLibrary.noResults' : 'mobileLibrary.emptyCollection')}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        className="ml-solid mt-3 w-full"
                        disabled={busy || selected.size === 0}
                        onClick={() => void removeSelected()}
                    >
                        {t('mobileLibrary.removeCountFromPlaylist', { count: selected.size })}
                    </button>
                </>
            )}
        </div>
    );
}

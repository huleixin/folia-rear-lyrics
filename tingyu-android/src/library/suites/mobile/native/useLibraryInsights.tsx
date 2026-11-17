import { useTranslation } from 'react-i18next';
import React, { useMemo, useState } from 'react';
import { Play, SlidersHorizontal, RefreshCw, Trash2, Plus } from 'lucide-react';
import { useLibraryInsightsData } from '../../../core/bindings/useLibraryInsightsData';
import { defaultSmartRules, evaluateSmartPlaylist, evaluateSmartPlaylists, type SmartRule } from '../../../core/model/smartPlaylists';
import { useLibraryOrganization } from '../../../core/state/useLibraryOrganization';
import { clearListeningStatistics } from '../../../../services/listeningStatistics';
import { absolutePageImage } from '../../../../services/nativePages';
import { getSongCoverUrl } from '../../../../services/onlineMusic/songMetadata';
import type { LibraryHomeSurfaceProps } from '../../../core/contracts/suite';
import type { PageActions, PageSection } from '../../../../types/nativePages';
import type { SongResult } from '../../../../types';
import { getPlaybackSourceRef } from '../../../../utils/appPlaybackGuards';
import { useListeningFootprint } from './useListeningFootprint';
import SmartRuleEditor, { newSmartRule } from './SmartRuleEditor';
import OperationPanel from '../../../../components/shared/OperationPanel';
import MobileSheet from '../../../../components/shared/MobileSheet';
import SaveSmartPlaylistPanel, { type SmartPlaylistExport } from './SaveSmartPlaylistPanel';

// src/library/suites/mobile/native/useLibraryInsights.tsx
/** Shared library insights; bottom management entry removed in favor of top-right Library Manage menu. */
export function useLibraryInsights(props: LibraryHomeSurfaceProps, source: string, owner: string) {
    const { t } = useTranslation();
    const data = useLibraryInsightsData(props, props.isInteractive, source);
    const rules = useLibraryOrganization(state => state.rules);
    const removeRule = useLibraryOrganization(state => state.removeRule);
    const [editing, setEditing] = useState<SmartRule | null>(null);
    const [manageSmartOpen, setManageSmartOpen] = useState(false);
    const [exporting, setExporting] = useState<SmartPlaylistExport | null>(null);
    const [menu, setMenu] = useState<string | null>(null);
    const [confirmClear, setConfirmClear] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [error, setError] = useState('');

    const footprint = useListeningFootprint(
        source,
        data.queryOwner,
        props.isInteractive,
        props.onPlaySong,
        () => { setError(''); setConfirmClear(true); },
        owner,
        props,
    );

    const day = new Date().toLocaleDateString('sv-SE');
    const allRules = useMemo(
        () => [...defaultSmartRules().map(rule => ({ ...rule, name: t(`libraryV2.builtin_${rule.id}`) })), ...rules],
        [rules, t],
    );
    const entries = useMemo(
        () => evaluateSmartPlaylists(data.candidates, data.sessions, allRules)
            .filter(entry => entry.songs.length || entry.rule.id.startsWith('custom:')),
        [data.candidates, data.sessions, allRules, day],
    );

    const openSongs = (rule: SmartRule, songs: SongResult[]) => {
        if (!songs.length) return;
        if (source === 'local') {
            const ids = new Set(songs.map(song => getPlaybackSourceRef(song).mediaId));
            const locals = new Map(props.localSongs.filter(song => ids.has(song.id)).map(song => [song.id, song]));
            props.homeResources.actions.openLocalGroup({
                id: 'smart:' + rule.id,
                type: 'playlist',
                name: rule.name,
                songs: songs.flatMap(song => { const local = locals.get(getPlaybackSourceRef(song).mediaId); return local ? [local] : []; }),
            }, props.onOpenGridView);
        } else {
            props.onOpenGridView({
                source: 'online',
                providerId: 'discovery',
                type: 'discovery',
                id: 'library-smart:' + rule.id,
                name: rule.name,
                description: '听屿智能歌单 · ' + t('libraryV2.smartScope'),
                trackCount: songs.length,
                coverUrl: getSongCoverUrl(songs[0]),
                discoveryTracks: songs,
            });
        }
    };

    const openCreateSmart = () => setEditing(newSmartRule('百听不厌'));
    const openManageSmart = () => setManageSmartOpen(true);

    const actions: PageActions = {
        'smart-settings': openCreateSmart,
        'listening-insights': () => footprint.open(),
        'insights-retry': data.retry,
    };

    const sections: PageSection[] = [];
    if (entries.length) {
        sections.push({
            id: 'smart-playlists',
            title: '智能歌单',
            layout: 'cards',
            items: entries.map(({ rule, songs }) => {
                const action = 'smart:' + rule.id;
                actions[action] = () => songs.length ? openSongs(rule, songs.map(item => item.song)) : setEditing(rule);
                actions['menu:' + rule.id] = () => setMenu(rule.id);
                return {
                    id: action,
                    title: rule.name,
                    subtitle: `智能歌单 · ${songs.length} 首`,
                    action,
                    image: songs[0] ? absolutePageImage(getSongCoverUrl(songs[0].song)) : undefined,
                    secondary: 'menu:' + rule.id,
                    secondaryLabel: t('mobileLibrary.more'),
                };
            }),
        });
    }
    if (data.loading) sections.push({ id: 'insights-loading', layout: 'message', text: t('libraryV2.preparing') });
    if (data.error) sections.push({ id: 'insights-error', layout: 'message', text: t(data.error), more: 'insights-retry', moreLabel: t('libraryV2.retry') });

    const panels = <>
        {footprint.page}
        <OperationPanel
            id="smart-playlist-actions"
            panel={menu ? {
                title: entries.find(item => item.rule.id === menu)?.rule.name || t('libraryV2.smart'),
                blocks: [{
                    id: 'actions',
                    kind: 'actions',
                    items: [
                        { id: 'play', label: '播放全部', icon: 'play' },
                        { id: 'open', label: t('libraryV2.viewSongs'), icon: 'list-music' },
                        ...(menu.startsWith('custom:') ? [{ id: 'edit', label: t('libraryV2.editRules'), icon: 'sliders-horizontal' }] : []),
                        { id: 'refresh', label: '更新匹配歌曲', icon: 'refresh-cw' },
                        ...(source === 'local' && props.directoryActions ? [{ id: 'export', label: t('libraryV2.export'), icon: 'folder-plus' }] : []),
                        ...(menu.startsWith('custom:') ? [{ id: 'delete', label: '删除智能歌单', icon: 'trash-2', tone: 'danger' as const }] : []),
                    ],
                }],
            } : null}
            onClose={() => setMenu(null)}
            onAction={id => {
                const entry = entries.find(item => item.rule.id === menu);
                const targetId = menu;
                setMenu(null);
                if (!entry) return;
                if (id === 'play' && entry.songs.length) props.onPlaySong(entry.songs[0].song, entry.songs.map(s => s.song));
                if (id === 'open') openSongs(entry.rule, entry.songs.map(item => item.song));
                if (id === 'edit') setEditing(entry.rule);
                if (id === 'refresh') data.retry();
                if (id === 'export' && source === 'local') setExporting({ name: entry.rule.name, trackIds: entry.songs.map(item => getPlaybackSourceRef(item.song).mediaId) });
                if (id === 'delete' && targetId) setConfirmDeleteId(targetId);
            }}
        />

        {manageSmartOpen && (
            <MobileSheet title="管理智能歌单" onClose={() => setManageSmartOpen(false)}>
                <div className="flex flex-col gap-3 pb-6">
                    <button
                        type="button"
                        onClick={() => { setManageSmartOpen(false); openCreateSmart(); }}
                        className="flex items-center justify-center gap-2 rounded-2xl py-3 text-[14px] font-semibold text-white"
                        style={{ background: 'var(--tingyu-accent, #527E9F)' }}
                    >
                        <Plus size={16} /> 创建智能歌单
                    </button>
                    {entries.filter(e => e.rule.id.startsWith('custom:')).length === 0 && (
                        <p className="text-[13px] opacity-70 text-center py-4 m-0">还没有自定义智能歌单，点击上方按钮即可创建。</p>
                    )}
                    {entries.filter(e => e.rule.id.startsWith('custom:')).map(({ rule, songs }) => (
                        <div
                            key={rule.id}
                            className="flex items-center justify-between rounded-2xl p-3"
                            style={{ background: 'var(--tingyu-surface-card, rgba(255,255,255,0.06))' }}
                        >
                            <div className="min-w-0 flex-1 pr-2">
                                <div className="truncate font-semibold text-[15px]">{rule.name}</div>
                                <div className="text-[12px] opacity-70">智能歌单 · {songs.length} 首</div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    aria-label="播放"
                                    disabled={!songs.length}
                                    onClick={() => { if (songs.length) { setManageSmartOpen(false); props.onPlaySong(songs[0].song, songs.map(s => s.song)); } }}
                                    className="p-2 rounded-xl disabled:opacity-35"
                                >
                                    <Play size={16} />
                                </button>
                                <button
                                    type="button"
                                    aria-label="编辑规则"
                                    onClick={() => { setManageSmartOpen(false); setEditing(rule); }}
                                    className="p-2 rounded-xl"
                                >
                                    <SlidersHorizontal size={16} />
                                </button>
                                <button
                                    type="button"
                                    aria-label="更新"
                                    onClick={() => data.retry()}
                                    className="p-2 rounded-xl"
                                >
                                    <RefreshCw size={16} />
                                </button>
                                <button
                                    type="button"
                                    aria-label="删除"
                                    onClick={() => setConfirmDeleteId(rule.id)}
                                    className="p-2 rounded-xl text-red-500"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </MobileSheet>
        )}

        <OperationPanel
            id="smart-playlist-delete-confirm"
            panel={confirmDeleteId ? {
                title: '删除智能歌单',
                kind: 'dialog',
                blocks: [{
                    id: 'confirm-del',
                    kind: 'confirm',
                    message: '仅删除此智能歌单规则，不会删除歌曲文件、最近播放或平台原始收藏。',
                    confirmLabel: '确认删除',
                    cancelLabel: '取消',
                    tone: 'danger',
                }],
            } : null}
            onClose={() => setConfirmDeleteId(null)}
            onAction={id => {
                if (id === 'confirm-del' && confirmDeleteId) removeRule(confirmDeleteId);
                setConfirmDeleteId(null);
            }}
        />

        <SaveSmartPlaylistPanel selection={exporting} controller={props.directoryActions} onClose={() => setExporting(null)} />

        <SmartRuleEditor
            rule={editing}
            onChange={setEditing}
            onClose={() => setEditing(null)}
            candidates={data.candidates}
            sessions={data.sessions}
            onPreview={rule => {
                setEditing(null);
                openSongs(rule, evaluateSmartPlaylist(data.candidates, data.sessions, rule).map(item => item.song));
            }}
        />

        <OperationPanel
            id="library-statistics-clear"
            panel={confirmClear ? {
                title: t('libraryV2.clearStats'),
                kind: 'dialog',
                blocks: [
                    {
                        id: 'confirm-clear',
                        kind: 'confirm',
                        message: '将清空本机有效收听时长、次数与音乐足迹报表，并同步影响「百听不厌」「好久不见」智能歌单及依赖收听记录的时光雷达；不会删除最近播放、收藏、原始歌单、本地音乐文件或音频缓存。',
                        confirmLabel: t('libraryV2.confirmClear'),
                        cancelLabel: '取消',
                        tone: 'danger',
                    },
                    ...(error ? [{ id: 'error', kind: 'note' as const, text: error, tone: 'error' as const }] : []),
                ],
            } : null}
            onClose={() => setConfirmClear(false)}
            onAction={id => {
                if (id === 'confirm-clear') {
                    void clearListeningStatistics().then(() => setConfirmClear(false))
                        .catch(() => setError(t('libraryV2.clearFailed')));
                }
            }}
        />
    </>;

    return { data, footprint, sections, actions, panels, openCreateSmart, openManageSmart, openFootprint: footprint.open };
}

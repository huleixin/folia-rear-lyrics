import { useTranslation } from 'react-i18next';
import React, { useMemo, useState } from 'react';
import { Play, SlidersHorizontal, RefreshCw, Trash2, Plus, Eye, ListMusic } from 'lucide-react';
import { useLibraryInsightsData } from '../../../core/bindings/useLibraryInsightsData';
import { defaultSmartRules, evaluateSmartPlaylist, evaluateSmartPlaylists, type SmartFacts, type SmartRule } from '../../../core/model/smartPlaylists';
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
import { useSheetThemeTokens } from './sheetThemeTokens';

// src/library/suites/mobile/native/useLibraryInsights.tsx
const SYSTEM_ART: Record<string, { c1: string; c2: string; label: string }> = {
    week: { c1: '#7196B5', c2: '#385B73', label: '7D' },
    month: { c1: '#527E9F', c2: '#203747', label: '30D' },
    forgotten: { c1: '#B9BCD9', c2: '#62678A', label: 'OLD' },
    added: { c1: '#AAC8DF', c2: '#49677D', label: 'NEW' },
    unheard: { c1: '#8EAEC8', c2: '#3B566B', label: 'LIKE' },
    quality: { c1: '#6FA3B8', c2: '#234C5E', label: 'SQ' },
    night: { c1: '#6D7A9E', c2: '#232B42', label: '22+' },
    year: { c1: '#7E9FB8', c2: '#2F4D63', label: 'YR' },
};

function smartArtDataUrl(c1: string, c2: string, label: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="256" height="256" rx="32" fill="url(#g)"/><circle cx="198" cy="58" r="56" fill="#fff" fill-opacity="0.10"/><circle cx="62" cy="198" r="72" fill="#fff" fill-opacity="0.08"/><text x="128" y="142" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="54" fill="#FFFFFF" fill-opacity="0.92">${label}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function smartEntryCover(rule: SmartRule, songs: SmartFacts[], usedCovers: Set<string>): string {
    if (!rule.id.startsWith('custom:')) {
        const spec = SYSTEM_ART[rule.id] ?? { c1: '#7196B5', c2: '#385B73', label: 'MIX' };
        return smartArtDataUrl(spec.c1, spec.c2, spec.label);
    }
    for (const entry of songs) {
        const cover = absolutePageImage(getSongCoverUrl(entry.song));
        if (cover && !usedCovers.has(cover)) {
            usedCovers.add(cover);
            return cover;
        }
    }
    const fallback = songs[0] ? absolutePageImage(getSongCoverUrl(songs[0].song)) : undefined;
    return fallback || smartArtDataUrl('#7196B5', '#385B73', '♪');
}

/** Shared library insights; bottom management entry removed in favor of top-right Library Manage menu. */
export function useLibraryInsights(props: LibraryHomeSurfaceProps, source: string, owner: string) {
    const { t } = useTranslation();
    const tokens = useSheetThemeTokens();
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

    const coverMap = useMemo(() => {
        const used = new Set<string>();
        const map = new Map<string, string>();
        for (const { rule, songs } of entries) {
            map.set(rule.id, smartEntryCover(rule, songs, used));
        }
        return map;
    }, [entries]);

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
                    subtitle: `${rule.id.startsWith('custom:') ? '我的智能歌单' : '系统智能歌单'} · ${songs.length} 首`,
                    action,
                    image: coverMap.get(rule.id),
                    secondary: 'menu:' + rule.id,
                    secondaryLabel: t('mobileLibrary.more'),
                };
            }),
        });
    }
    if (data.error) sections.push({ id: 'insights-error', layout: 'message', text: t(data.error), more: 'insights-retry', moreLabel: t('libraryV2.retry') });

    const systemEntries = entries.filter(e => !e.rule.id.startsWith('custom:'));
    const customEntries = entries.filter(e => e.rule.id.startsWith('custom:'));

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
            <MobileSheet
                title="管理智能歌单"
                footer={
                    <button
                        type="button"
                        onClick={() => { setManageSmartOpen(false); openCreateSmart(); }}
                        className="w-full flex items-center justify-center gap-2"
                        style={{
                            height: 48,
                            borderRadius: 14,
                            fontSize: 14,
                            fontWeight: 600,
                            background: tokens.primaryBtnBg,
                            color: tokens.primaryBtnText,
                        }}
                    >
                        <Plus size={20} /> 创建智能歌单
                    </button>
                }
                onClose={() => setManageSmartOpen(false)}
            >
                <div className="flex flex-col pb-4" style={{ gap: 20 }}>
                    {/* 分组1：系统智能歌单 */}
                    <section>
                        <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 10px', color: tokens.text }}>系统智能歌单</h3>
                        <div className="flex flex-col gap-2">
                            {systemEntries.length === 0 ? (
                                <p className="m-0 py-2" style={{ fontSize: 12, color: tokens.muted }}>
                                    暂无匹配歌曲，播放或收藏歌曲后将自动生成。
                                </p>
                            ) : systemEntries.map(({ rule, songs }) => (
                                <div
                                    key={rule.id}
                                    className="flex items-center justify-between rounded-2xl px-3 py-2"
                                    style={{ minHeight: 56, background: tokens.cardBg, border: `1px solid ${tokens.border}` }}
                                >
                                    <img
                                        src={coverMap.get(rule.id)}
                                        alt=""
                                        className="shrink-0 object-cover"
                                        style={{ width: 40, height: 40, borderRadius: 8, marginRight: 12 }}
                                    />
                                    <div className="min-w-0 flex-1 pr-2">
                                        <div className="truncate font-medium" style={{ fontSize: 14, color: tokens.text }}>{rule.name}</div>
                                        <div style={{ fontSize: 12, color: tokens.muted }}>系统预设 · {songs.length} 首</div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            aria-label="查看歌曲"
                                            onClick={() => { setManageSmartOpen(false); openSongs(rule, songs.map(s => s.song)); }}
                                            className="flex items-center justify-center rounded-xl"
                                            style={{ minWidth: 40, minHeight: 40, color: tokens.text }}
                                        >
                                            <Eye size={17} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="播放"
                                            disabled={!songs.length}
                                            onClick={() => { if (songs.length) { setManageSmartOpen(false); props.onPlaySong(songs[0].song, songs.map(s => s.song)); } }}
                                            className="flex items-center justify-center rounded-xl disabled:opacity-35"
                                            style={{ minWidth: 40, minHeight: 40, color: tokens.accent }}
                                        >
                                            <Play size={17} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="刷新"
                                            onClick={() => data.retry()}
                                            className="flex items-center justify-center rounded-xl"
                                            style={{ minWidth: 40, minHeight: 40, color: tokens.muted }}
                                        >
                                            <RefreshCw size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* 分组2：我的智能歌单 */}
                    <section>
                        <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 10px', color: tokens.text }}>我的智能歌单</h3>
                        {customEntries.length === 0 ? (
                            <div
                                className="flex flex-col items-center text-center rounded-2xl py-6 px-4"
                                style={{ background: tokens.cardBg, border: `1px solid ${tokens.border}` }}
                            >
                                <ListMusic size={48} strokeWidth={1.5} color={tokens.accent} style={{ opacity: 0.75 }} />
                                <div className="mt-2.5 font-semibold" style={{ fontSize: 14, color: tokens.text }}>还没有自定义歌单</div>
                                <div className="mt-1" style={{ fontSize: 12, color: tokens.muted }}>创建属于自己的音乐整理规则。</div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {customEntries.map(({ rule, songs }) => (
                                    <div
                                        key={rule.id}
                                        className="flex items-center justify-between rounded-2xl px-3 py-2"
                                        style={{ minHeight: 56, background: tokens.cardBg, border: `1px solid ${tokens.border}` }}
                                    >
                                        <img
                                            src={coverMap.get(rule.id)}
                                            alt=""
                                            className="shrink-0 object-cover"
                                            style={{ width: 40, height: 40, borderRadius: 8, marginRight: 12 }}
                                        />
                                        <div className="min-w-0 flex-1 pr-2">
                                            <div className="truncate font-medium" style={{ fontSize: 14, color: tokens.text }}>{rule.name}</div>
                                            <div style={{ fontSize: 12, color: tokens.muted }}>我的歌单 · {songs.length} 首</div>
                                        </div>
                                        <div className="flex items-center">
                                            <button
                                                type="button"
                                                aria-label="播放"
                                                disabled={!songs.length}
                                                onClick={() => { if (songs.length) { setManageSmartOpen(false); props.onPlaySong(songs[0].song, songs.map(s => s.song)); } }}
                                                className="flex items-center justify-center rounded-xl disabled:opacity-35"
                                                style={{ minWidth: 40, minHeight: 40, color: tokens.accent }}
                                            >
                                                <Play size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="编辑规则"
                                                onClick={() => { setManageSmartOpen(false); setEditing(rule); }}
                                                className="flex items-center justify-center rounded-xl"
                                                style={{ minWidth: 40, minHeight: 40, color: tokens.text }}
                                            >
                                                <SlidersHorizontal size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="更新"
                                                onClick={() => data.retry()}
                                                className="flex items-center justify-center rounded-xl"
                                                style={{ minWidth: 40, minHeight: 40, color: tokens.muted }}
                                            >
                                                <RefreshCw size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="删除"
                                                onClick={() => setConfirmDeleteId(rule.id)}
                                                className="flex items-center justify-center rounded-xl text-red-500"
                                                style={{ minWidth: 40, minHeight: 40 }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
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

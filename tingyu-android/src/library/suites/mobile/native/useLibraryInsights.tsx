import React, { useMemo, useState } from 'react';
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
import SaveSmartPlaylistPanel, { type SmartPlaylistExport } from './SaveSmartPlaylistPanel';

// src/library/suites/mobile/native/useLibraryInsights.tsx
/** Shared library insights; the caller remains the sole native page publisher. */
export function useLibraryInsights(props: LibraryHomeSurfaceProps, source: string, owner: string) {
    const data = useLibraryInsightsData(props, props.isInteractive, source);
    const rules = useLibraryOrganization(state => state.rules);
    const [editing, setEditing] = useState<SmartRule | null>(null);
    const [exporting, setExporting] = useState<SmartPlaylistExport | null>(null);
    const [menu, setMenu] = useState<string | null>(null);
    const [confirmClear, setConfirmClear] = useState(false), [error, setError] = useState('');
    const footprint = useListeningFootprint(data.sessions, props.isInteractive, data.truncated, props.onPlaySong,
        () => { setError(''); setConfirmClear(true); }, owner);
    const day = new Date().toLocaleDateString('sv-SE');
    const entries = useMemo(() => evaluateSmartPlaylists(data.candidates, data.sessions, [...defaultSmartRules(), ...rules])
        .filter(entry => entry.songs.length || entry.rule.id.startsWith('custom:')),
    [data.candidates, data.sessions, rules, day]);
    const openSongs = (rule: SmartRule, songs: SongResult[]) => {
        if (!songs.length) return;
        if (source === 'local') {
            const ids = new Set(songs.map(song => getPlaybackSourceRef(song).mediaId));
            const locals = new Map(props.localSongs.filter(song => ids.has(song.id)).map(song => [song.id, song]));
            props.homeResources.actions.openLocalGroup({ id: 'smart:' + rule.id, type: 'playlist', name: rule.name,
                songs: songs.flatMap(song => { const local = locals.get(getPlaybackSourceRef(song).mediaId); return local ? [local] : []; }) }, props.onOpenGridView);
        } else props.onOpenGridView({ source: 'online', providerId: 'discovery', type: 'discovery',
            id: 'library-smart:' + rule.id, name: rule.name, description: '基于听屿记录期间的收藏与有效收听数据',
            trackCount: songs.length, coverUrl: getSongCoverUrl(songs[0]), discoveryTracks: songs });
    };
    const actions: PageActions = {
        'smart-settings': () => setEditing(newSmartRule()),
        'listening-insights': () => footprint.open(),
        'insights-retry': data.retry,
    };
    const sections: PageSection[] = [];
    if (entries.length) sections.push({ id: 'smart-playlists', title: '智能歌单', layout: 'cards', items: entries.map(({ rule, songs }) => {
        const action = 'smart:' + rule.id;
        actions[action] = () => songs.length ? openSongs(rule, songs.map(item => item.song)) : setEditing(rule);
        actions['menu:' + rule.id] = () => setMenu(rule.id);
        return { id: action, title: rule.name, subtitle: songs.length + ' 首 · 听屿记录期间', action,
            image: songs[0] ? absolutePageImage(getSongCoverUrl(songs[0].song)) : undefined,
            secondary: 'menu:' + rule.id, secondaryLabel: '⋮' };
    }) });
    sections.push({ id: 'library-insights', title: '听歌管理', layout: 'quickLinks', items: [
        { id: 'smart-settings', title: '自定义智能歌单', subtitle: '按条件自动更新', image: 'list-plus', action: 'smart-settings' },
        { id: 'listening-insights', title: '音乐足迹', subtitle: '查看真实收听记录', image: 'chart-no-axes-combined', action: 'listening-insights' },
    ] });
    if (data.loading) sections.push({ id: 'insights-loading', layout: 'message', text: '正在整理本机收听记录…' });
    if (data.error) sections.push({ id: 'insights-error', layout: 'message', text: data.error, more: 'insights-retry', moreLabel: '重试' });
    if (data.truncated) sections.push({ id: 'insights-range', layout: 'message', text: '当前基于最近50,000条有效收听记录，较早记录仍保存在本机。' });
    const panels = <>
        <OperationPanel id="smart-playlist-actions" panel={menu ? { title: '智能歌单', blocks: [{ id: 'actions', kind: 'actions', items: [
            { id: 'open', label: '查看歌曲' },
            ...(menu.startsWith('custom:') ? [{ id: 'edit', label: '编辑规则' }] : []),
            ...(source === 'local' && props.directoryActions ? [{ id: 'export', label: '另存为本地歌单' }] : []),
        ] }] } : null} onClose={() => setMenu(null)} onAction={id => {
            const entry = entries.find(item => item.rule.id === menu); setMenu(null);
            if (!entry) return;
            if (id === 'open') openSongs(entry.rule, entry.songs.map(item => item.song));
            if (id === 'edit') setEditing(entry.rule);
            if (id === 'export' && source === 'local') setExporting({ name: entry.rule.name,
                trackIds: entry.songs.map(item => getPlaybackSourceRef(item.song).mediaId) });
        }}/>
        <SaveSmartPlaylistPanel selection={exporting} controller={props.directoryActions} onClose={() => setExporting(null)}/>
        <SmartRuleEditor rule={editing} onChange={setEditing} onClose={() => setEditing(null)}
            candidates={data.candidates} sessions={data.sessions} onPreview={rule => {
                setEditing(null); openSongs(rule, evaluateSmartPlaylist(data.candidates, data.sessions, rule).map(item => item.song));
            }}/>
        <OperationPanel id="library-statistics-clear" panel={confirmClear ? { title: '清空有效收听统计', blocks: [
            { id: 'confirm-clear', kind: 'confirm', message: '清空本机全部账户的有效收听统计，不会删除收藏、歌单、本地音乐、原有历史或推荐偏好。', confirmLabel: '清空统计', tone: 'danger' },
            ...(error ? [{ id: 'error', kind: 'note' as const, text: error, tone: 'error' as const }] : []),
        ] } : null} onClose={() => setConfirmClear(false)} onAction={id => {
            if (id === 'confirm-clear') void clearListeningStatistics().then(() => setConfirmClear(false))
                .catch(() => setError('清空失败，请重试。'));
        }}/>
    </>;
    return { data, footprint, sections, actions, panels };
}

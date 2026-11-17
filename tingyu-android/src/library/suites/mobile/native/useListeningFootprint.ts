import { useMemo, useState } from 'react';
import { summarizeListening } from '../../../../services/listeningStatistics';
import { listeningRange, type ListeningRange } from '../../../core/model/listeningRange';
import { useModalBackHandler } from '../../../../hooks/useModalBackHandler';
import { omni } from '../../../../services/onlineMusic/omni';
import { getSongCoverUrl } from '../../../../services/onlineMusic/songMetadata';
import { absolutePageImage } from '../../../../services/nativePages';
import { getPlaybackSongKey } from '../../../../utils/appPlaybackGuards';
import type { ListeningSessionRecord } from '../../../../types/listeningStatistics';
import type { NativePageModel, PageActions, PageSection } from '../../../../types/nativePages';
import type { SongResult } from '../../../../types';

// src/library/suites/mobile/native/useListeningFootprint.ts
/** A subpage of the existing library owner, sharing its data and native back stack. */
export function useListeningFootprint(records: ListeningSessionRecord[], active: boolean, truncated: boolean,
    play: (song: SongResult, queue?: SongResult[]) => void, clear: () => void, owner: string) {
    const [opened, setOpened] = useState(false), [range, setRange] = useState<ListeningRange>('month');
    const [custom, setCustom] = useState({ from: '', to: '' });
    useModalBackHandler(opened && active, () => setOpened(false));
    const day = new Date().toLocaleDateString('sv-SE');
    const summary = useMemo(() => {
        const bounds = listeningRange(range, Date.now(), custom);
        return summarizeListening(opened && active && bounds ? records.filter(record => record.startedAt >= bounds.from && record.startedAt < bounds.to) : []);
    }, [records, range, custom, day, opened, active]);
    const actions: PageActions = { back: () => setOpened(false), clear,
        from: event => setCustom(value => ({ ...value, from: event.text || '' })),
        to: event => setCustom(value => ({ ...value, to: event.text || '' })) };
    const labels: Record<ListeningRange, string> = { today: '今日', week: '本周', month: '本月', year: '本年度', all: '全部记录', custom: '自定义' };
    const sections: PageSection[] = [{ id: 'footprint-range', layout: 'chips', items: (Object.keys(labels) as ListeningRange[]).map(id => {
        actions[id] = () => setRange(id);
        return { id, title: labels[id], action: id, selected: range === id };
    }) }];
    if (range === 'custom') sections.push(
        { id: 'from', layout: 'input', value: custom.from, placeholder: '开始日期 YYYY-MM-DD', action: 'from' },
        { id: 'to', layout: 'input', value: custom.to, placeholder: '结束日期 YYYY-MM-DD', action: 'to' });
    sections.push({ id: 'summary', layout: 'message', text: listeningRange(range, Date.now(), custom)
        ? '有效收听 ' + Math.floor(summary.seconds / 60) + ' 分钟 · ' + summary.plays + ' 次\n' + summary.songs + ' 首歌曲 · ' + summary.artists + ' 位歌手 · ' + summary.albums + ' 张专辑'
        : '请输入有效日期，结束日期不能早于开始日期。' });
    const songs = summary.topSongs.slice(0, 100);
    sections.push({ id: 'footprint-songs', title: '最常听歌曲', layout: 'rows', key: range + custom.from + custom.to, items: songs.map(item => {
        const id = 'song:' + getPlaybackSongKey(item.song); actions[id] = () => play(item.song, songs.map(entry => entry.song));
        return { id, title: item.song.name, subtitle: item.plays + ' 次 · ' + Math.floor(item.seconds / 60) + ' 分钟', image: absolutePageImage(getSongCoverUrl(item.song)), action: id };
    }) });
    sections.push({ id: 'providers', title: '来源占比 · 有效时长', layout: 'bars', items: summary.providers.map(item => ({
        id: item.id, title: omni.getProviderLabel(item.id), number: String(item.seconds / Math.max(1, summary.seconds)),
        subtitle: Math.round(100 * item.seconds / Math.max(1, summary.seconds)) + '% · ' + item.plays + ' 次' })) });
    sections.push({ id: 'artists', layout: 'message', text: '常听歌手\n' + (summary.topArtists.slice(0, 10).map(item => item.name + ' · ' + item.plays + ' 次').join('\n') || '暂无有效记录') });
    sections.push({ id: 'albums', layout: 'message', text: '常听专辑\n' + (summary.topAlbums.slice(0, 10).map(item => item.name + ' · ' + item.plays + ' 次').join('\n') || '暂无有效记录') });
    const daily = summary.daily.slice(-31), maximum = Math.max(1, ...daily.map(item => item.seconds));
    sections.push({ id: 'daily', title: '每日收听 · 最近31个有记录的日期', layout: 'bars', items: daily.map(item => ({
        id: item.day, title: item.day, number: String(item.seconds / maximum), subtitle: Math.floor(item.seconds / 60) + ' 分钟 · ' + item.plays + ' 次' })) });
    const hourlyMaximum = Math.max(1, ...summary.hourly);
    sections.push({ id: 'hourly', title: '常用收听时段', layout: 'bars', items: summary.hourly.flatMap((seconds, hour) => seconds ? [{
        id: String(hour), title: String(hour).padStart(2, '0') + ':00', number: String(seconds / hourlyMaximum), subtitle: Math.floor(seconds / 60) + ' 分钟' }] : []) });
    const first = records.reduce<number | null>((value, item) => Math.min(value ?? item.startedAt, item.startedAt), null);
    sections.push({ id: 'scope', layout: 'message', text: '仅统计听屿记录到的、单会话不少于30秒的有效收听；不以歌曲总时长补算旧记录。'
        + (first ? '\n当前可用记录起于 ' + new Date(first).toLocaleDateString() : '')
        + (truncated ? '\n当前读取最近50,000条记录，较早记录未删除。' : '') },
        { id: 'clear', layout: 'textActions', items: [{ id: 'clear', title: '清空有效收听统计', action: 'clear' }] });
    const model: NativePageModel = { key: 'library:footprint:' + owner, title: '音乐足迹', leading: 'back', bottomClearance: 152, sections };
    return { opened, open: () => setOpened(true), model, actions };
}

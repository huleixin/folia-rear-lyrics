import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { summarizeListening } from '../../../../services/listeningStatistics';
import { useListeningCatalogNavigation } from '../../../core/bindings/useListeningCatalogNavigation';
import { useListeningRangeData } from '../../../core/bindings/useListeningRangeData';
import type { LibraryHomeSurfaceProps } from '../../../core/contracts/suite';
import { listeningRange, type ListeningRange } from '../../../core/model/listeningRange';
import { useModalBackHandler } from '../../../../hooks/useModalBackHandler';
import { omni } from '../../../../services/onlineMusic/omni';
import { getSongCoverUrl } from '../../../../services/onlineMusic/songMetadata';
import { absolutePageImage } from '../../../../services/nativePages';
import { getPlaybackSongKey } from '../../../../utils/appPlaybackGuards';
import type { NativePageModel, PageActions, PageSection } from '../../../../types/nativePages';
import type { SongResult } from '../../../../types';

// src/library/suites/mobile/native/useListeningFootprint.ts
/** A subpage of the existing library owner, sharing its data and native back stack. */
export function useListeningFootprint(source: string, scopeOwner: string, active: boolean,
    play: (song: SongResult, queue?: SongResult[]) => void, clear: () => void, owner: string,
    navigation: Pick<LibraryHomeSurfaceProps, 'localSongs' | 'localLibraryCatalog' | 'onOpenGridView'>) {
    const { t } = useTranslation();
    const [opened, setOpened] = useState(false), [range, setRange] = useState<ListeningRange>('month');
    const [custom, setCustom] = useState({ from: '', to: '' });
    const data = useListeningRangeData(source, scopeOwner, opened && active, range, custom);
    const { records, truncated } = data;
    const { catalogError, openEntity } = useListeningCatalogNavigation(owner, active, opened, navigation);
    useModalBackHandler(opened && active, () => setOpened(false));
    const day = new Date().toLocaleDateString('sv-SE');
    const summary = useMemo(() => {
        const bounds = listeningRange(range, Date.now(), custom);
        return summarizeListening(opened && active && bounds ? records.filter(record => record.startedAt >= bounds.from && record.startedAt < bounds.to) : []);
    }, [records, range, custom, day, opened, active]);
    const actions: PageActions = { back: () => setOpened(false), clear, retry: data.retry,
        from: event => setCustom(value => ({ ...value, from: event.text || '' })),
        to: event => setCustom(value => ({ ...value, to: event.text || '' })) };
    const labels: Record<ListeningRange, string> = { today: t('libraryV2.range_today'), week: t('libraryV2.range_week'), month: t('libraryV2.range_month'), year: t('libraryV2.range_year'), all: t('libraryV2.range_all'), custom: t('libraryV2.range_custom') };
    const sections: PageSection[] = [{ id: 'footprint-range', layout: 'chips', items: (Object.keys(labels) as ListeningRange[]).map(id => {
        actions[id] = () => setRange(id);
        return { id, title: labels[id], action: id, selected: range === id };
    }) }];
    if (range === 'custom') sections.push(
        { id: 'from', layout: 'input', value: custom.from, placeholder: t('libraryV2.fromDate'), action: 'from' },
        { id: 'to', layout: 'input', value: custom.to, placeholder: t('libraryV2.toDate'), action: 'to' });
    sections.push({ id: 'summary', layout: 'message', text: data.loading ? t('libraryV2.preparing')
        : data.error ? t('libraryV2.insightsFailed') : listeningRange(range, Date.now(), custom)
        ? t('libraryV2.statsSummary', { minutes: Math.floor(summary.seconds / 60), plays: summary.plays, songs: summary.songs, artists: summary.artists, albums: summary.albums })
        : t('libraryV2.invalidDate'), more: data.error ? 'retry' : undefined, moreLabel: t('libraryV2.retry') });
    const songs = summary.topSongs.slice(0, 100);
    sections.push({ id: 'footprint-songs', title: t('libraryV2.topSongs'), layout: 'rows', key: range + custom.from + custom.to, items: songs.map(item => {
        const id = 'song:' + getPlaybackSongKey(item.song); actions[id] = () => play(item.song, songs.map(entry => entry.song));
        return { id, title: item.song.name, subtitle: t('libraryV2.playTime', { plays: item.plays, minutes: Math.floor(item.seconds / 60) }), image: absolutePageImage(getSongCoverUrl(item.song)), action: id };
    }) });
    sections.push({ id: 'providers', title: t('libraryV2.providerShare'), layout: 'bars', items: summary.providers.map(item => ({
        id: item.id, title: omni.getProviderLabel(item.id), number: String(item.seconds / Math.max(1, summary.seconds)),
        subtitle: Math.round(100 * item.seconds / Math.max(1, summary.seconds)) + '% · ' + t('libraryV2.plays', { count: item.plays }) })) });
    for (const kind of ['artist', 'album'] as const) {
        const entries = kind === 'artist' ? summary.topArtists : summary.topAlbums;
        sections.push({ id: kind, title: t(kind === 'artist' ? 'libraryV2.topArtists' : 'libraryV2.topAlbums'), layout: 'rows',
            items: entries.slice(0, 10).map(entry => {
                const id = kind + ':' + entry.key;
                actions[id] = () => { void openEntity(entry, kind); };
                return { id, title: entry.name, subtitle: t('libraryV2.playTime', { plays: entry.plays, minutes: Math.floor(entry.seconds / 60) }), action: id };
            }) });
    }
    if (catalogError) sections.push({ id: 'catalog-error', layout: 'message', text: t('libraryV2.catalogUnavailable') });
    const daily = summary.daily.slice(-31), maximum = Math.max(1, ...daily.map(item => item.seconds));
    sections.push({ id: 'daily', title: t('libraryV2.daily'), layout: 'bars', items: daily.map(item => ({
        id: item.day, title: item.day, number: String(item.seconds / maximum), subtitle: t('libraryV2.playTime', { plays: item.plays, minutes: Math.floor(item.seconds / 60) }) })) });
    const hourlyMaximum = Math.max(1, ...summary.hourly);
    sections.push({ id: 'hourly', title: t('libraryV2.hourly'), layout: 'bars', items: summary.hourly.flatMap((seconds, hour) => seconds ? [{
        id: String(hour), title: String(hour).padStart(2, '0') + ':00', number: String(seconds / hourlyMaximum), subtitle: t('libraryV2.minutes', { count: Math.floor(seconds / 60) }) }] : []) });
    const first = records.reduce<number | null>((value, item) => Math.min(value ?? item.startedAt, item.startedAt), null);
    sections.push({ id: 'scope', layout: 'message', text: t('libraryV2.statsScope')
        + (first ? '\n' + t('libraryV2.recordsFrom', { date: new Date(first).toLocaleDateString() }) : '')
        + (truncated ? '\n' + t('libraryV2.rangeTruncated') : '') },
        { id: 'clear', layout: 'textActions', items: [{ id: 'clear', title: t('libraryV2.clearStats'), action: 'clear' }] });
    const model: NativePageModel = { key: 'library:footprint:' + owner, title: t('libraryV2.footprint'), leading: 'back', bottomClearance: 152, sections };
    return { opened, open: () => setOpened(true), model, actions };
}

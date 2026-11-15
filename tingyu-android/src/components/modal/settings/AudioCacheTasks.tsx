import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import OperationPanel from '../../../library/suites/mobile/native/OperationPanel';
import { audioCacheRequest, type AudioCacheStatus } from '../../../services/audioPlaylistCache';
import { getTingyuPlayback } from '../../../platform/tingyuPlayback';
import { formatOfflineBytes } from './OfflineCacheOverview';
import type { ResourceStatus } from './useResourceCacheStatus';
import type { NativePanelBlock, NativePanelModel } from '../../../types/nativePanels';

// One bounded native task page is mounted only while the task sheet is open.
export default function AudioCacheTasks({ collections = [], resources, onClose }: {
    collections: NonNullable<AudioCacheStatus['collections']>; resources:ResourceStatus; onClose: () => void;
}) {
    const { t } = useTranslation();
    const text = (key: string) => t('audioCache.' + key);
    const [filter, setFilter] = useState('active'), [collection, setCollection] = useState('');
    const [offset, setOffset] = useState(0), [expanded, setExpanded] = useState(-1);
    const [page, setPage] = useState<{ tasks: AudioCacheStatus['tasks']; total: number; offset: number }>({ tasks: [], total: 0, offset: 0 });
    const [busy, setBusy] = useState(true), [error, setError] = useState('');
    useEffect(() => {
        let ticket = 0;
        let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
        const load = async () => {
            if (document.visibilityState !== 'visible') return;
            const own=++ticket;
            try {
                const value = await getTingyuPlayback<{ audioOffline(data: object): Promise<typeof page> }>().audioOffline({ action: 'tasks', state: filter, collection, offset });
                if (alive&&own===ticket) { setPage(value); setError(''); setBusy(false); }
            } catch { if (alive&&own===ticket) { setError(text('error')); setBusy(false); } }
            if (alive&&own===ticket && document.visibilityState === 'visible') timer = setTimeout(load, 4000);
        };
        const visibility = () => { ticket++;clearTimeout(timer); if (document.visibilityState === 'visible') void load(); };
        setBusy(true); setExpanded(-1); void load(); document.addEventListener('visibilitychange', visibility);
        return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
    }, [filter, collection, offset]);
    const blocks: NativePanelBlock[] = [
        {kind:'note',id:'resources',text:text('resourceDetails')+(resources.descriptor?.name?' · '+resources.descriptor.name:'')+'\n'+t('audioCache.lyricsProgress',{count:resources.lyricsReady??0,total:resources.total})+'\n'+t('audioCache.artworkProgress',{count:resources.artworkReady??0,total:resources.total})+'\n'+t('audioCache.resourceOccupancy',{size:formatOfflineBytes(resources.lyricsBytes+resources.artworkBytes)})},
        { kind: 'select', id: 'playlist', label: text('allPlaylists'), value: collection, options: [{ value: '', label: text('allPlaylists') }, ...collections.map(c => ({ value: c.id, label: `${c.name} · ${c.complete}/${c.total}` }))] },
        { kind: 'select', id: 'filter', label: text('audio'), value: filter, options: ['active', 'failed', 'completed'].map((key, i) => ({ value: ['active', 'failed', 'complete'][i], label: text(key) })) },
        { kind: 'note', id: 'count', text: t('audioCache.page', { offset: page.total ? page.offset + 1 : 0, end: Math.min(page.offset + page.tasks.length, page.total), total: page.total }) },
        { kind: 'actions', id: 'tasks', items: page.tasks.map((task, i) => ({ id: `task:${i}`, label: task.title, hint: `${text('state.' + task.state)} · ${(task.bytes / 1048576).toFixed(1)} MB`, icon: task.state === 'failed' ? 'info' : 'music2' })) },
    ];
    if (!busy && !page.tasks.length) blocks.push({ kind: 'note', id: 'empty', text: text('empty') });
    if (expanded >= 0 && page.tasks[expanded]?.reason) blocks.push({ kind: 'note', id: 'reason', text: page.tasks[expanded].reason, tone: 'error' });
    blocks.push({ kind: 'actions', id: 'pages', items: [
        { id: 'previous', label: text('previous'), disabled: offset === 0 || busy },
        { id: 'next', label: text('next'), disabled: page.offset + page.tasks.length >= page.total || busy },
        ...(filter === 'failed' && page.total ? [{ id: 'retry', label: text('retry'), icon: 'refresh-cw' }] : []),
    ] });
    const panel: NativePanelModel = { title: text('tasks'), blocks, busy, error, heightFraction: .86 };
    return <OperationPanel id="offline-cache-tasks" panel={panel} onClose={onClose} onAction={(id, payload) => {
        if (id === 'filter') { setFilter(payload?.text ?? 'active'); setOffset(0); }
        else if (id === 'playlist') { setCollection(payload?.text ?? ''); setOffset(0); }
        else if (id === 'previous') setOffset(Math.max(0, offset - 20));
        else if (id === 'next') setOffset(offset + 20);
        else if (id === 'retry') void audioCacheRequest({ action: 'retry' }).then(() => { setFilter('active'); setOffset(0); }).catch(() => setError(text('error')));
        else if (id.startsWith('task:')) setExpanded(Number(id.slice(5)));
    }} />;
}

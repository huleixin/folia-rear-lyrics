import React, { useEffect, useState } from 'react';
import OperationPanel from '../OperationPanel';
import { omni } from '../../../../../services/onlineMusic/omni';
import type { ProviderHistoryEntry } from '../../../../../types/onlineMusic';
import type { SongResult } from '../../../../../types';
import type { NativePanelBlock } from '../../../../../types/nativePanels';

type Source = ReturnType<typeof omni.getProviderSummaries>[number];
export default function DiscoveryHistoryPanel({ open, sources, onClose, onSongs }: {
    open: boolean; sources: Source[]; onClose: () => void; onSongs: (title: string, songs: SongResult[]) => void;
}) {
    const supported = sources.filter(source => { try { return omni.getRecommendationCapabilities(source.providerId).history; } catch { return false; } });
    const [provider, setProvider] = useState(supported[0]?.providerId ?? '');
    const [entries, setEntries] = useState<ProviderHistoryEntry[]>([]);
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    useEffect(() => {
        if (open && supported.length && !supported.some(source => source.providerId === provider)) setProvider(supported[0].providerId);
    }, [open]);
    useEffect(() => {
        if (!open || !provider) { setEntries([]); return; }
        let alive = true; setBusy(true); setError('');
        void omni.getProviderRecommendationHistory(provider).then(rows => { if (alive) setEntries(rows); })
            .catch(() => { if (alive) { setEntries([]); setError('历史推荐暂时无法加载。'); } })
            .finally(() => { if (alive) setBusy(false); });
        return () => { alive = false; };
    }, [open, provider]);
    const blocks: NativePanelBlock[] = [
        ...(supported.length > 1 ? [{ kind: 'select' as const, id: 'provider', label: '来源', value: provider,
            options: supported.map(source => ({ value: source.providerId, label: omni.getProviderLabel(source.providerId, false) })) }] : []),
        { kind: 'actions', id: 'history', items: busy ? [] : entries.map(entry => ({ id: 'date:' + entry.id, label: entry.label, hint: '查看当天真实推荐' })) },
        ...(busy ? [{ kind: 'note' as const, id: 'busy', text: '正在读取历史每日推荐…' }] : []),
        ...(error ? [{ kind: 'note' as const, id: 'error', text: error, tone: 'error' as const }] : []),
        ...(!busy && !error && !entries.length ? [{ kind: 'note' as const, id: 'empty', text: supported.length ? '这个来源暂时没有历史每日推荐。' : '当前来源不提供历史每日推荐。' }] : []),
    ];
    return <OperationPanel id="discovery-history" panel={open ? { title: '历史每日推荐', blocks } : null} onClose={onClose} onAction={(id, payload) => {
        if (id === 'provider') { setProvider(payload?.text ?? ''); return; }
        if (!id.startsWith('date:')) return;
        const entry = entries.find(row => row.id === id.slice(5)); if (!entry) return;
        setBusy(true);
        void omni.getProviderRecommendationHistorySongs(provider, entry).then(list => {
            if (!list.length) { setError('这一天没有可用的推荐歌曲。'); return; }
            onSongs(omni.getProviderLabel(provider) + ' · ' + entry.label, list);
        }).catch(() => setError('当天推荐暂时无法加载。')).finally(() => setBusy(false));
    }}/>;
}

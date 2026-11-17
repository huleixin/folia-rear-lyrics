import React, { useEffect, useRef, useState } from 'react';
import OperationPanel from '../../../../components/shared/OperationPanel';
import type { LibraryDirectoryBatchController } from '../../../core/contracts/directory';

// src/library/suites/mobile/native/SaveSmartPlaylistPanel.tsx
export type SmartPlaylistExport = { name: string; trackIds: string[] };
/** Save an explicit local snapshot through the existing directory mutation controller. */
export default function SaveSmartPlaylistPanel({ selection, controller, onClose }: {
    selection: SmartPlaylistExport | null;
    controller?: LibraryDirectoryBatchController;
    onClose: () => void;
}) {
    const [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const pending = useRef(false);
    const current = useRef(selection); current.current = selection;
    useEffect(() => { setName(selection?.name || ''); setError(''); }, [selection]);
    const save = async () => {
        if (!selection || !controller || pending.current || !name.trim()) return;
        pending.current = true; setBusy(true); setError('');
        try {
            const result = await controller.createPlaylist(name.trim(), { items: [], trackIds: selection.trackIds });
            if (current.current !== selection) return;
            if (result.ok) onClose();
            else setError(result.reason === 'busy' ? '另一个资料库操作正在进行，请稍后重试。' : '保存失败，歌曲和智能规则仍保留。');
        } catch { if (current.current === selection) setError('保存失败，请重试。'); }
        finally { pending.current = false; setBusy(false); }
    };
    return <OperationPanel id="smart-playlist-export" panel={selection ? {
        title: '另存为本地歌单', busy, error, blocks: [
            { id: 'name', kind: 'input', label: '歌单名称', value: name, confirmLabel: '更新名称' },
            { id: 'scope', kind: 'note', text: '保存当前 ' + selection.trackIds.length + ' 首本地歌曲。新歌单独立保存，原智能规则继续自动更新。' },
            { id: 'save-actions', kind: 'actions', items: [{ id: 'save', label: '创建歌单', disabled: busy || !name.trim() || !selection.trackIds.length || !controller }] },
        ],
    } : null} onClose={() => { if (!pending.current) onClose(); }} onAction={(id, payload) => {
        if (id === 'name' && !pending.current) setName((payload?.text || '').slice(0, 80));
        if (id === 'save') void save();
    }}/>;
}

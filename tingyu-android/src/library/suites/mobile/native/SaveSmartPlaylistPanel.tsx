import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation();
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
            else setError(result.reason === 'busy' ? t('libraryV2.saveBusy') : t('libraryV2.saveFailed'));
        } catch { if (current.current === selection) setError(t('libraryV2.retrySave')); }
        finally { pending.current = false; setBusy(false); }
    };
    return <OperationPanel id="smart-playlist-export" panel={selection ? {
        title: t('libraryV2.export'), busy, error, blocks: [
            { id: 'name', kind: 'input', label: t('libraryV2.playlistName'), value: name, confirmLabel: t('libraryV2.updateName') },
            { id: 'scope', kind: 'note', text: t('libraryV2.exportScope', { count: selection.trackIds.length }) },
            { id: 'save-actions', kind: 'actions', items: [{ id: 'save', label: t('libraryV2.createPlaylist'), disabled: busy || !name.trim() || !selection.trackIds.length || !controller }] },
        ],
    } : null} onClose={() => { if (!pending.current) onClose(); }} onAction={(id, payload) => {
        if (id === 'name' && !pending.current) setName((payload?.text || '').slice(0, 80));
        if (id === 'save') void save();
    }}/>;
}

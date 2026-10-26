import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setRearLyricsBackend, type RearLyricsStatus } from '../../../services/rearLyricsControl';

// src/components/modal/settings/RearBridgeSettings.tsx
export default function RearBridgeSettings({ snapshot, refresh }: {
    snapshot: RearLyricsStatus | null; refresh: () => Promise<void>;
}) {
    const { t } = useTranslation();
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const change = async (mode: 'lsp' | 'shizuku') => {
        if (busy) return;
        setBusy(true); setFailed(false);
        try { if (!await setRearLyricsBackend(mode)) setFailed(true); await refresh(); }
        catch { setFailed(true); }
        finally { setBusy(false); }
    };
    return <div className="mt-4 space-y-2">
        <label className="flex items-center justify-between gap-3 text-sm">
            <span>{t('rearBridge.mode')}</span>
            <select aria-label={t('rearBridge.mode')} className="rounded-lg bg-black/10 p-2"
                value={snapshot?.backendMode ?? 'shizuku'}
                disabled={!snapshot || busy || snapshot.enabled || snapshot.starting || snapshot.sleeping}
                onChange={event => void change(event.target.value as 'lsp' | 'shizuku')}>
                <option value="shizuku">Shizuku</option><option value="lsp">LSP / LSPosed</option>
            </select>
        </label>
        <p className="text-xs opacity-70 leading-relaxed">{t('rearBridge.switchHint')}</p>
        {snapshot?.backendMode === 'lsp' && snapshot.lspConnected &&
            <p className="text-xs" role="status">{t('rearBridge.connected')}</p>}
        <details className="text-xs opacity-70 leading-relaxed">
            <summary className="cursor-pointer py-2">{t('rearBridge.help')}</summary>
            <p>{t('rearBridge.setup')}</p><p className="mt-2">{t('rearBridge.lyricInfo')}</p>
        </details>
        {failed && <p role="alert" className="text-xs">{t('rearBridge.failed')}</p>}
    </div>;
}

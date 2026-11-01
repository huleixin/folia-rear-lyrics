import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rearLyricsPlugin } from '../../../services/rearLyricsControl';
import RearLspGuide from './RearLspGuide';

// src/components/modal/settings/RearLyricsGuide.tsx
export default function RearLyricsGuide() {
    const { t } = useTranslation();
    const [diagnostics, setDiagnostics] = useState('');
    const [busy, setBusy] = useState(false);
    const [exporting, setExporting] = useState(false), [exportMessage, setExportMessage] = useState('');
    const exportDiagnostics = async () => {
        if (exporting) return;
        setExporting(true); setExportMessage('');
        try {
            const [{ buildDiagnosticReport }, { exportDiagnosticReport }, { redactDiagnosticReport }] = await Promise.all([
                import('../../../utils/buildDiagnosticReport'), import('../../../services/exportDiagnosticReport'),
                import('../../../utils/diagnosticRedaction'),
            ]);
            await exportDiagnosticReport(redactDiagnosticReport(await buildDiagnosticReport()), t('help.exportDiagnostics'));
        } catch { setExportMessage(t('help.exportDiagnosticsFailed')); }
        finally { setExporting(false); }
    };
    const loadDiagnostics = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const result = await rearLyricsPlugin()?.getRearLyricsStatus();
            setDiagnostics([`backend=${result?.backendMode || 'unknown'}, lspConnected=${!!result?.lspConnected}`, result?.lspDetail, result?.message, result?.diagnostics, result?.sleepDiagnostics].filter(Boolean).join('\n') || t('mobileSettings.diagnosticsUnavailable'));
        } catch (error) {
            console.error('[settings/rear-lyrics] diagnostics unavailable', error);
            setDiagnostics(t('mobileSettings.diagnosticsUnavailable'));
        } finally { setBusy(false); }
    };
    return <article className="ty-rear-guide">
        <RearLspGuide />
        {['requirements', 'enable', 'synchronization', 'recovery', 'troubleshooting'].map(topic => <div className="ty-settings-card" key={topic}>
            <h2>{t(`mobileSettings.guide.${topic}Title`)}</h2><p>{t(`mobileSettings.guide.${topic}`)}</p>
        </div>)}
        <details onToggle={event => { if (event.currentTarget.open && !diagnostics) void loadDiagnostics(); }}>
            <summary>{t('options.rearLyricsDiagnostics')}</summary>
            <pre className="ty-settings-diagnostics">{busy ? t('mobileSettings.rearState.detecting') : diagnostics}</pre>
            <button type="button" disabled={exporting} aria-busy={exporting} onClick={()=>void exportDiagnostics()}
                className="mt-3 rounded-xl border border-current/15 px-4 py-3 text-sm" style={{color:'var(--text-primary)'}}>
                {t('help.exportDiagnostics')}{exporting?'…':''}
            </button>
            {exportMessage && <p role="status">{exportMessage}</p>}
        </details>
    </article>;
}

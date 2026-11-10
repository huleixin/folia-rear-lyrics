import React, { useEffect,useRef,useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rearLyricsPlugin, type RearLyricsStatus } from '../../../services/rearLyricsControl';
import RearLspGuide from './RearLspGuide';

// src/components/modal/settings/RearLyricsGuide.tsx
export default function RearLyricsGuide({backend='shizuku',diagnosticsOnly=false}:{backend?:'lsp'|'shizuku';diagnosticsOnly?:boolean}={}) {
    const { t } = useTranslation();
    const [diagnostics, setDiagnostics] = useState('');
    const [status, setStatus] = useState<RearLyricsStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [exporting, setExporting] = useState(false), [exportMessage, setExportMessage] = useState('');
    const loading=useRef(false),exportLock=useRef(false);
    const exportDiagnostics = async () => {
        if (exportLock.current) return;
        exportLock.current=true;
        setExporting(true); setExportMessage('');
        try {
            const [{ buildDiagnosticReport }, { exportDiagnosticReport }, { redactDiagnosticReport }] = await Promise.all([
                import('../../../utils/buildDiagnosticReport'), import('../../../services/exportDiagnosticReport'),
                import('../../../utils/diagnosticRedaction'),
            ]);
            await exportDiagnosticReport(redactDiagnosticReport(await buildDiagnosticReport()), t('help.exportDiagnostics'));
        } catch { setExportMessage(t('help.exportDiagnosticsFailed')); }
        finally { exportLock.current=false;setExporting(false); }
    };
    const loadDiagnostics = async () => {
        if (loading.current) return;
        loading.current=true;
        setBusy(true);
        try {
            const result = await rearLyricsPlugin()?.getRearLyricsStatus();
            setStatus(result ?? null);
            setDiagnostics(result ? [`backend=${result.backendMode || 'unknown'}, lspConnected=${result.lspConnected ?? 'unknown'}`, result.lspDetail, result.message, result.diagnostics, result.sleepDiagnostics].filter(Boolean).join('\n') : t('mobileSettings.diagnosticsUnavailable'));
        } catch (error) {
            setStatus(null);
            console.error('[settings/rear-lyrics] diagnostics unavailable', error);
            setDiagnostics(t('mobileSettings.diagnosticsUnavailable'));
        } finally { loading.current=false;setBusy(false); }
    };
    useEffect(()=>{if(diagnosticsOnly)void loadDiagnostics();},[diagnosticsOnly]);
    return <article className="ty-rear-guide" data-settings-style='{"gap":16}' data-settings-layout="column">
        {!diagnosticsOnly&&(backend==='lsp'?<RearLspGuide/>:<aside className="ty-settings-card" data-settings-style='{"border":true,"radius":14,"padding":[16,16,16,16],"gap":12}' data-settings-layout="card"><h2 data-settings-style='{"font":20,"weight":600}' data-settings-layout="wrap">{t('rearControl.authorizationGuide')}</h2><ol className="list-decimal pl-5 space-y-2" data-settings-style='{"gap":8,"padding":[20,0,0,0]}' data-settings-layout="column" data-settings-list="ordered">{['serviceStep','permissionStep','startStep'].map(key=><li key={key} data-settings-layout="column">{t(`rearControl.${key}`)}</li>)}</ol><p data-settings-layout="wrap">{t('rearControl.lockedBrief')}</p></aside>)}
        {!diagnosticsOnly&&['requirements', 'synchronization', 'recovery', 'troubleshooting'].map(topic => <div className="ty-settings-card" key={topic} data-settings-style='{"border":true,"radius":14,"padding":[16,16,16,16],"gap":12}' data-settings-layout="card">
            <h2 data-settings-style='{"font":20,"weight":600}' data-settings-layout="wrap">{t(`mobileSettings.guide.${topic}Title`)}</h2><p data-settings-layout="wrap">{t(`mobileSettings.guide.${topic}`)}</p>
        </div>)}
        {!diagnosticsOnly&&<details data-settings-layout="column"><summary data-settings-layout="column">{t('rearBridge.help')}</summary><p data-settings-layout="wrap">{t('rearBridge.behavior')}</p><p data-settings-layout="wrap">{t('rearBridge.lyricInfo')}</p></details>}
        <section className="ty-settings-card" data-settings-layout="card" data-settings-style='{"gap":12,"border":true,"radius":14,"padding":[16,16,16,16]}'>
            <h2 data-settings-layout="column" data-settings-style='{"font":14,"weight":600}'>{t('rearControl.status')}</h2>
            <p data-settings-layout="column" data-settings-style='{"font":13,"tone":"muted"}'>
                {busy ? t('mobileSettings.rearState.detecting') : status
                    ? (status.backendMode === 'lsp' ? 'LSP · ' + t(typeof status.lspConnected === 'boolean' ? (status.lspConnected ? 'rearControl.connected' : 'rearControl.disconnected') : 'mobileSettings.diagnosticsUnavailable')
                        : status.backendMode === 'shizuku' ? 'Shizuku · ' + t(typeof status.shizukuAvailable === 'boolean' ? (status.shizukuAvailable ? 'rearControl.serviceStarted' : 'rearControl.serviceStopped') : 'mobileSettings.diagnosticsUnavailable')
                        : t('mobileSettings.diagnosticsUnavailable'))
                    : t('mobileSettings.diagnosticsUnavailable')}
            </p>
            {typeof status?.enabled === 'boolean' && <p data-settings-layout="column" data-settings-style='{"font":12,"tone":"muted"}'>
                {t(status.enabled ? 'rearControl.enabled' : 'rearControl.disabled')} · {t('rearControl.diagnosticsBrief')}
            </p>}
            <div data-settings-layout="grid" data-settings-style='{"columns":2,"gap":8}'>
            <button type="button" disabled={busy} onClick={()=>void loadDiagnostics()}
                data-settings-layout="row" data-settings-style='{"radius":12,"border":true,"font":12,"center":true,"padding":[10,12,10,12]}'>
                {t('rearControl.refresh')}
            </button>
            <button type="button" disabled={exporting} aria-busy={exporting} onClick={()=>void exportDiagnostics()}
                className="rounded-xl border border-current/15 px-4 py-3 text-sm" style={{color:'var(--text-primary)'}} data-settings-style='{"radius":12,"border":true,"font":12,"padding":[10,12,10,12],"center":true,"tone":"text"}' data-settings-layout="row">
                {t('help.exportDiagnostics')}{exporting?'…':''}
            </button>
            </div>
            {exportMessage && <p role="status" data-settings-layout="wrap">{exportMessage}</p>}
        </section>
        <details onToggle={event => { if (event.currentTarget.open && !diagnostics) void loadDiagnostics(); }} data-settings-layout="column" data-settings-style='{"gap":12}'>
            <summary data-settings-layout="row" data-settings-style='{"font":13,"minHeight":44,"tone":"accent"}'>{t('rearControl.diagnosticsBrief')}</summary>
            <pre className="ty-settings-diagnostics" data-settings-layout="column" data-settings-style='{"font":11,"maxHeight":320,"scroll":true,"fill":true,"radius":12,"padding":[12,12,12,12]}'>{busy ? t('mobileSettings.rearState.detecting') : diagnostics}</pre>
        </details>
    </article>;
}

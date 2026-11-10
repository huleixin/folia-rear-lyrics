import React, { useEffect,useRef,useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rearLyricsPlugin } from '../../../services/rearLyricsControl';
import RearLspGuide from './RearLspGuide';

// src/components/modal/settings/RearLyricsGuide.tsx
export default function RearLyricsGuide({backend='shizuku',diagnosticsOnly=false}:{backend?:'lsp'|'shizuku';diagnosticsOnly?:boolean}={}) {
    const { t } = useTranslation();
    const [diagnostics, setDiagnostics] = useState('');
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
            setDiagnostics([`backend=${result?.backendMode || 'unknown'}, lspConnected=${!!result?.lspConnected}`, result?.lspDetail, result?.message, result?.diagnostics, result?.sleepDiagnostics].filter(Boolean).join('\n') || t('mobileSettings.diagnosticsUnavailable'));
        } catch (error) {
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
        <details open={diagnosticsOnly?true:undefined} onToggle={event => { if (event.currentTarget.open && !diagnostics) void loadDiagnostics(); }} data-settings-layout="column">
            <summary data-settings-layout="column">{t('rearControl.diagnostics')}</summary>
            <pre className="ty-settings-diagnostics" data-settings-layout="column">{busy ? t('mobileSettings.rearState.detecting') : diagnostics}</pre>
            <button type="button" disabled={exporting} aria-busy={exporting} onClick={()=>void exportDiagnostics()}
                className="mt-3 rounded-xl border border-current/15 px-4 py-3 text-sm" style={{color:'var(--text-primary)'}} data-settings-style='{"radius":12,"border":true,"font":14,"padding":[16,12,16,12],"margin":[0,12,0,0],"tone":"text"}' data-settings-layout="row">
                {t('help.exportDiagnostics')}{exporting?'…':''}
            </button>
            {exportMessage && <p role="status" data-settings-layout="wrap">{exportMessage}</p>}
        </details>
    </article>;
}

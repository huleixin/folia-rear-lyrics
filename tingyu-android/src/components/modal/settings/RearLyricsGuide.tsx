import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rearLyricsPlugin } from '../../../services/rearLyricsControl';
import RearLspGuide from './RearLspGuide';

// src/components/modal/settings/RearLyricsGuide.tsx
export default function RearLyricsGuide() {
    const { t } = useTranslation();
    const [diagnostics, setDiagnostics] = useState('');
    const [busy, setBusy] = useState(false);
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
        </details>
    </article>;
}

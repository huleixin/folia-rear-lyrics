import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackEngineTestStore } from '../../../stores/usePlaybackEngineTestStore';
import { applyPlaybackEngine, canSelectPlaybackEngine, canUsePlaybackEngineTest, exportPlaybackTestLog, loadPlaybackTestTone } from '../../../services/playbackEngineTest';
import { notePlaybackTest } from '../../../services/playbackTestLog';
import GraphicsDiagnosticsSettings from './GraphicsDiagnosticsSettings';

// src/components/modal/settings/PlaybackEngineTestSettings.tsx
// The engine preference is a functional setting: it is applied only through an acknowledged stop
// and a reload. Tone loading and log export stay hidden outside the diagnostic build.
export default function PlaybackEngineTestSettings({ settingsCardClass }: { settingsCardClass: string }) {
    const { t } = useTranslation();
    const { selected, actual, reason, select } = usePlaybackEngineTestStore();
    const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
    if (!canSelectPlaybackEngine()) return null;
    const diagnostic = canUsePlaybackEngineTest();
    const run = async (action: () => Promise<unknown>, success: string) => {
        setBusy(true); setMessage('');
        try { await action(); setMessage(success); }
        catch (error) { notePlaybackTest('engine-action-failed', { error }); setMessage(t('playbackEngine.failed')); }
        finally { setBusy(false); }
    };
    const label = (engine: string) => t(`playbackEngine.${engine === 'media3' ? 'native' : engine === 'web' ? 'compatible' : 'pending'}`);
    const button = 'min-h-9 px-3 py-2 rounded-lg border border-current/15 text-xs hover:bg-current/5 disabled:opacity-40';
    return <div data-testid="playback-engine" className={`mt-4 rounded-xl border p-4 space-y-3 ${settingsCardClass}`}>
        <h3 className="text-sm font-semibold">{t('playbackEngine.title')}</h3>
        <p className="text-xs opacity-60 leading-relaxed">{t('playbackEngine.description')}</p>
        <div className="flex gap-2" role="radiogroup" aria-label={t('playbackEngine.title')}>
            {(['media3', 'web'] as const).map(engine => <button key={engine} type="button" disabled={busy} role="radio" aria-checked={selected === engine}
                onClick={() => select(engine)} className={`${button} flex-1 ${selected === engine ? 'bg-current/10 font-semibold' : ''}`}>
                {label(engine)}{selected === engine ? ' ✓' : ''}
            </button>)}
        </div>
        <p className="text-xs leading-relaxed" aria-live="polite">{t('playbackEngine.actual', { engine: label(actual) })}
            {selected === 'media3' && actual !== 'media3' ? ` · ${t(`playbackEngine.reason.${reason}`, { defaultValue: reason })}` : ''}</p>
        <button type="button" disabled={busy} className={`${button} w-full`} onClick={() => void run(() => applyPlaybackEngine(selected), '')}>{t('playbackEngine.apply')}</button>
        <p className="text-xs opacity-60 leading-relaxed">{t('playbackEngine.note')}</p>
        {diagnostic && <>
            <button type="button" disabled={busy} className={`${button} w-full`} onClick={() => void run(loadPlaybackTestTone, t('playbackTest.toneLoaded'))}>{t('playbackTest.tone')}</button>
            <button type="button" className={`${button} w-full`} onClick={() => { void exportPlaybackTestLog().catch(error => {
                notePlaybackTest('export-failed', { error }); setMessage(t('playbackEngine.failed'));
            }); }}>{t('playbackTest.export')}</button>
        </>}
        {message && <p role="status" className="text-xs leading-relaxed">{message}</p>}
        <GraphicsDiagnosticsSettings />
    </div>;
}

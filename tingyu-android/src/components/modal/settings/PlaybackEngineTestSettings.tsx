import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackEngineTestStore } from '../../../stores/usePlaybackEngineTestStore';
import { PLAYBACK_TEST_SESSION_ENGINE } from '../../../utils/playbackEngineTestBuild';
import { applyPlaybackTestEngine, canUsePlaybackEngineTest, exportPlaybackTestLog, loadPlaybackTestTone } from '../../../services/playbackEngineTest';
import { notePlaybackTest } from '../../../services/playbackTestLog';

// src/components/modal/settings/PlaybackEngineTestSettings.tsx
export default function PlaybackEngineTestSettings({ settingsCardClass }: { settingsCardClass: string }) {
    const { t } = useTranslation();
    const { selected, actual, reason, select } = usePlaybackEngineTestStore();
    const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
    if (!canUsePlaybackEngineTest()) return null;
    const run = async (action: () => Promise<unknown>, success: string) => {
        setBusy(true); setMessage('');
        try { await action(); setMessage(success); }
        catch (error) { notePlaybackTest('test-action-failed', { error }); setMessage(t('playbackTest.failed')); }
        finally { setBusy(false); }
    };
    const button = 'min-h-9 px-3 py-2 rounded-lg border border-current/15 text-xs hover:bg-current/5 disabled:opacity-40';
    return <div data-testid="playback-engine-test" className={`mt-4 rounded-xl border p-4 space-y-3 ${settingsCardClass}`}>
        <h3 className="text-sm font-semibold">{t('playbackTest.title')}</h3>
        <p className="text-xs opacity-60 leading-relaxed">{t('playbackTest.description')}</p>
        <div className="flex gap-2">
            {(['web', 'media3'] as const).map(engine => <button key={engine} type="button" disabled={busy} aria-pressed={selected === engine}
                onClick={() => select(engine)} className={`${button} flex-1 ${selected === engine ? 'bg-current/10 font-semibold' : ''}`}>
                {t(`playbackTest.${engine}`)}{selected === engine ? ' ✓' : ''}
            </button>)}
        </div>
        <p className="text-xs leading-relaxed" aria-live="polite">{t('playbackTest.actual', { engine: t(`playbackTest.${actual}`) })}
            {actual !== 'media3' && PLAYBACK_TEST_SESSION_ENGINE === 'media3' ? ` · ${t(`playbackTest.reason.${reason}`, { defaultValue: reason })}` : ''}</p>
        <button type="button" disabled={busy} className={`${button} w-full`} onClick={() => void run(() => applyPlaybackTestEngine(selected), '')}>{t('playbackTest.apply')}</button>
        <p className="text-xs opacity-60 leading-relaxed">{t('playbackTest.compatibility')}</p>
        <button type="button" disabled={busy} className={`${button} w-full`} onClick={() => void run(loadPlaybackTestTone, t('playbackTest.toneLoaded'))}>{t('playbackTest.tone')}</button>
        <button type="button" className={`${button} w-full`} onClick={() => { void exportPlaybackTestLog().catch(error => {
            notePlaybackTest('export-failed', { error }); setMessage(t('playbackTest.failed'));
        }); }}>{t('playbackTest.export')}</button>
        {message && <p role="status" className="text-xs leading-relaxed">{message}</p>}
    </div>;
}

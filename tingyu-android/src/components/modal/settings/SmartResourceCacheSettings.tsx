import React from 'react';
import { useTranslation } from 'react-i18next';
import { isCapacitorAndroid } from '../../../platform/runtime';
import { getTingyuPlayback } from '../../../platform/tingyuPlayback';

// src/components/modal/settings/SmartResourceCacheSettings.tsx
interface CacheStatus {
    enabled: boolean; wifiOnly: boolean; lyricsBytes: number; artworkBytes: number;
    total: number; completed: number; failed: number; cachedSongs: number;
}
interface CacheBridge {
    resourceCache(options: { action?: string; enabled?: boolean; wifiOnly?: boolean }): Promise<CacheStatus>;
}
export default function SmartResourceCacheSettings() {
    const { t } = useTranslation();
    const [status, setStatus] = React.useState<CacheStatus | null>(null);
    const [busy, setBusy] = React.useState(false);
    const update = React.useCallback(async (action?: string, next?: Partial<CacheStatus>) => {
        setBusy(true);
        try { setStatus(await getTingyuPlayback<CacheBridge>().resourceCache({ action, ...next })); }
        finally { setBusy(false); }
    }, []);
    React.useEffect(() => {
        if (!isCapacitorAndroid()) return;
        let active = true;
        void getTingyuPlayback<CacheBridge>().resourceCache({}).then(value => { if (active) setStatus(value); }).catch(() => {});
        return () => { active = false; };
    }, []);
    if (!isCapacitorAndroid() || !status) return null;
    const mb = (bytes: number) => (bytes / 1048576).toFixed(1) + ' MB';
    return <section className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <h3 className="font-semibold">{t('resourceCache.title')}</h3>
        <p className="text-sm opacity-60">{t('resourceCache.description')}</p>
        <label className="flex items-center justify-between gap-3">
            {t('resourceCache.enabled')}
            <input type="checkbox" checked={status.enabled} disabled={busy}
                onChange={event => void update('configure', { ...status, enabled: event.target.checked }).catch(() => {})} />
        </label>
        <label className="flex items-center justify-between gap-3">
            {t('resourceCache.wifiOnly')}
            <input type="checkbox" checked={status.wifiOnly} disabled={busy}
                onChange={event => void update('configure', { ...status, wifiOnly: event.target.checked }).catch(() => {})} />
        </label>
        <p className="text-sm opacity-70">{t('resourceCache.usage', {
            lyrics: mb(status.lyricsBytes), covers: mb(status.artworkBytes),
            completed: status.completed, total: status.total, failed: status.failed, songs: status.cachedSongs,
        })}</p>
        <div className="flex flex-wrap gap-3">
            <button disabled={busy} onClick={() => void update().catch(() => {})}>{t('resourceCache.refresh')}</button>
            <button disabled={busy} onClick={() => void update('clear').catch(() => {})}>{t('resourceCache.clear')}</button>
        </div>
    </section>;
}

import { useTranslation } from 'react-i18next';
import type { AudioCacheStatus } from '../../../services/audioPlaylistCache';

// src/components/modal/settings/OfflineCacheOverview.tsx
// Device usage and one playlist's download progress never share a denominator.
export function formatOfflineBytes(bytes: number) {
    return bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(1)} GB` : `${(bytes / 1048576).toFixed(1)} MB`;
}
export function currentAudioCollection(status: AudioCacheStatus) {
    const groups = status.collections ?? [];
    return groups.find(g => (g.running ?? 0) > 0) ?? groups.find(g => (g.pending ?? 0) > 0) ?? groups[0];
}
export default function OfflineCacheOverview({ status: s }: { status: AudioCacheStatus }) {
    const { t } = useTranslation(), group = currentAudioCollection(s);
    const running = s.tasks.find(task => task.state === 'running');
    const percent = group?.total ? Math.min(1, group.complete / group.total) : 0;
    return <>
        <div className="offline-cache-summary offline-cache-device" data-settings-layout="card" data-settings-style='{"padding":[16,16,16,16],"gap":8,"radius":16,"fill":true}'>
            <span data-settings-layout="wrap" data-settings-style='{"font":12,"tone":"muted"}'>{t('audioCache.deviceAudio')}</span>
            <strong data-settings-layout="wrap" data-settings-style='{"font":25,"weight":650}'>{t('audioCache.trackCount', { count: s.cached })}</strong>
            <span data-settings-layout="wrap" data-settings-style='{"font":12,"tone":"muted"}'>{t('audioCache.storageUsage', { size: formatOfflineBytes(s.bytes) })}</span>
        </div>
        <div className="offline-cache-summary" data-settings-layout="column" data-settings-style='{"gap":10}'>
            <span data-settings-layout="wrap" data-settings-style='{"font":13,"weight":600}'>{t('audioCache.currentPlaylist')}</span>
            {group ? <>
                <span data-settings-layout="wrap">{group.name}</span>
                <strong data-settings-layout="wrap" data-settings-style='{"font":20,"weight":650}'>{t('audioCache.playlistProgress', { complete: group.complete, total: group.total })}</strong>
                <div role="progressbar" aria-valuenow={group.complete} aria-valuemin={0} aria-valuemax={group.total} className="resource-meter" data-settings-layout="column" data-settings-style={JSON.stringify({ height: 6, radius: 64, progress: percent })}><div style={{ width: `${percent * 100}%` }} /></div>
                <span data-settings-layout="wrap" data-settings-style='{"font":12,"tone":"muted"}'>{t('audioCache.queueProgress', { pending: (group.pending ?? 0) + (group.running ?? 0), failed: group.failed })}</span>
                {running && (group.running ?? 0) > 0 && <div data-settings-layout="column" data-settings-style='{"gap":4}'><span data-settings-layout="wrap">{t('audioCache.downloading', { name: running.title })}</span><span data-settings-layout="wrap" data-settings-style='{"font":12,"tone":"muted"}'>{t('audioCache.downloadBytes', { size: formatOfflineBytes(running.bytes) })}</span></div>}
            </> : <span data-settings-layout="wrap" data-settings-style='{"font":12,"tone":"muted"}'>{t('audioCache.noTasks')}</span>}
        </div>
    </>;
}

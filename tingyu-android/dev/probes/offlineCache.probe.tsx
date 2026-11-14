import type { CSSProperties } from 'react';
import AudioCacheSettings from '../../src/components/modal/settings/AudioCacheSettings';
import LxManagerControls from '../../src/components/audio-tools/LxManagerControls';
import type { ProbeDefinition } from './definition';
import '../../src/components/audio-tools/audioTools.css';

// The component runner supplies a bounded fake native transport, without platform accounts.
function OfflineCacheProbe() {
    return <main style={{ padding: 18, maxWidth: 680, margin: 'auto', background: '#f4f7fa', color: '#24323e', '--text-primary': '#24323e', '--text-secondary': '#657581', '--storage-accent': '#476d82', '--storage-line': '#d6dfe6', '--storage-surface': '#fff' } as CSSProperties}>
        <h1>存储与同步</h1><AudioCacheSettings />
        <section className="ty-lx-dialog" style={{ marginTop: 24 }}><LxManagerControls busy={false} selected={null} onInstall={async () => {}} onError={() => {}} onBusyChange={() => {}} onSelect={() => {}} /></section>
    </main>;
}
export default { id: 'offlineCache', title: '离线缓存与音源顺序', description: '合并设置、分页任务与原生选择回传的受控回归。', Component: OfflineCacheProbe } satisfies ProbeDefinition;

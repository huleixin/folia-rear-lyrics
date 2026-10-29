import { useMemo, useState } from 'react';
import '../../src/i18n/config';
import '../../src/library/suites/mobile/mobileLibrary.css';
import MobileTrackList from '../../src/library/suites/mobile/MobileTrackList';
import { normalizeQqSong } from '../../src/services/onlineMusic/qqNormalize';
import type { CollectionView } from '../../src/library/core/bindings/useCollectionView';
import type { ProbeDefinition } from './definition';

// dev/probes/catalogAudioSpecs.probe.tsx
const variants = [
    { name: '无损规格示例', file: { size_flac: 1000 }, artist: '歌手甲 / 歌手乙' },
    { name: '高清与杜比规格示例', file: { size_hires: 1000, size_dolby: 1000 }, artist: '名字很长的歌手甲 / 名字很长的歌手乙 / The Long Artist Name' },
    { name: 'DTS 规格示例', file: { size_dts: 1000 }, artist: '歌手丙' },
    { name: '高品质规格示例', file: { size_320mp3: 1000 }, artist: '歌手丁' },
    { name: '未知规格示例', file: {}, artist: '未知规格应保持原来的歌手排版' },
];
const songs = Array.from({ length: 397 }, (_, index) => {
    const item = variants[index % variants.length];
    return normalizeQqSong({ mid: `spec-${index}`, name: `${item.name} ${index + 1}`, interval: 270,
        singer: [{ mid: `artist-${index}`, name: item.artist }], file: item.file });
});
function CatalogAudioSpecsProbe() {
    const [unknown, setUnknown] = useState(false), [action, setAction] = useState('待操作');
    const view = useMemo(() => ({ displayTracks: songs,
        matchIndexes: unknown ? songs.flatMap((song, index) => song.catalogAudioSpecs ? [] : [index]) : null }) as CollectionView, [unknown]);
    return <main className="mobile-library" style={{ height: '100dvh', boxSizing: 'border-box', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ fontSize: 22 }}>歌单规格标签</h1>
        <button onClick={() => setUnknown(value => !value)} data-testid="spec-filter">{unknown ? '显示全部' : '仅未知规格'}</button>
        <output data-testid="spec-action">{action}</output>
        <section style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <MobileTrackList view={view} sessionKey="specs-probe" query={unknown ? 'unknown' : ''} showArtwork
                onPlay={song => setAction(`播放：${song.name}`)} onMenu={song => setAction(`菜单：${song.name}`)} />
        </section>
    </main>;
}
export default { id: 'catalogAudioSpecs', title: '歌单规格标签',
    description: '397 首虚拟行、长歌手名、未知规格、筛选与原有播放菜单命中区。', Component: CatalogAudioSpecsProbe } satisfies ProbeDefinition;

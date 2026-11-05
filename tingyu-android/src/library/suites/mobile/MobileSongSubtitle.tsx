import type { TFunction } from 'i18next';
import type { SongResult } from '../../../types';
import { getCatalogAudioLabels } from '../../../utils/catalogAudioLabels';
import { resolveCatalogQualityLevel } from '../../../components/app/overlays/minimal-stage/qualityBadgeSpecs';

// src/library/suites/mobile/MobileSongSubtitle.tsx
// 歌单 / 搜索 / 歌手详情等移动端歌曲行的副标题。
// 音质标识用**轻量文字标签**（用户指定：无底色、无边框、无图标、9~10sp，
// 层级色相与主题墨色低饱和混合 —— 浅色模式深色可读，深色模式自动适配）。
// 颜色规则集中在 mobileLibrary.css 的 .ml-quality-text[data-level]，与原生端同源。
const TEXT_LABELS: Record<string, string> = {
    standard: '标准', hq: 'HQ', flac: '无损', hires: 'Hi-Res', master: '母带', spatial: '空间',
};
export default function MobileSongSubtitle({ artist, song, t }: { artist: string; song: Pick<SongResult, 'catalogAudioSpecs'>; t: TFunction }) {
    const level = resolveCatalogQualityLevel(song.catalogAudioSpecs);
    const labels = getCatalogAudioLabels(song, t);
    const description = t('catalogAudioSpecs.description', { specs: labels.join(' / ') });
    return <small className="ml-song-subtitle">
        <span className="ml-song-artist">{artist}</span>
        {level && (
            <span className="ml-quality-text" data-level={level} title={description} aria-label={description}>
                {TEXT_LABELS[level] ?? ''}
            </span>
        )}
    </small>;
}

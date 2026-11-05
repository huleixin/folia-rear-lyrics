import type { TFunction } from 'i18next';
import type { SongResult } from '../../../types';
import { getCatalogAudioLabels } from '../../../utils/catalogAudioLabels';
import { resolveCatalogQualityLevel } from '../../../components/app/overlays/minimal-stage/qualityBadgeSpecs';
import { QualityBadge } from '../../../components/app/overlays/minimal-stage/QualityBadge';

// src/library/suites/mobile/MobileSongSubtitle.tsx
// 歌单 / 搜索 / 歌手详情等移动端歌曲行的副标题。
// 音质标签统一走全局 QualityBadge（目录语境：这首歌有什么版本），
// 旧版半透明灰签（ml-audio-spec）废弃 —— 歌单/搜索/播放页只用同一套标签视觉。
export default function MobileSongSubtitle({ artist, song, t }: { artist: string; song: Pick<SongResult, 'catalogAudioSpecs'>; t: TFunction }) {
    const level = resolveCatalogQualityLevel(song.catalogAudioSpecs);
    const labels = getCatalogAudioLabels(song, t);
    const description = t('catalogAudioSpecs.description', { specs: labels.join(' / ') });
    return <small className="ml-song-subtitle">
        <span className="ml-song-artist">{artist}</span>
        {level && (
            <span className="ml-song-quality" title={description} aria-label={description}>
                <QualityBadge level={level} size="compact" />
            </span>
        )}
    </small>;
}

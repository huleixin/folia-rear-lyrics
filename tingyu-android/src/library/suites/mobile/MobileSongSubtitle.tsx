import type { TFunction } from 'i18next';
import type { SongResult } from '../../../types';
import { catalogBadgePageFields, getCatalogBadges } from '../../../utils/catalogAudioLabels';

// src/library/suites/mobile/MobileSongSubtitle.tsx
// 歌单 / 搜索 / 歌手详情等移动端歌曲行的副标题。
// Compact catalog badges share their semantic model with native Compose song rows.
export default function MobileSongSubtitle({ artist, song, t }: { artist: string; song: Pick<SongResult, 'catalogAudioSpecs' | 'catalogAccess'>; t: TFunction }) {
    const badges = getCatalogBadges(song, t);
    const description = catalogBadgePageFields(song, t).audioSpecsLabel;
    return <small className="ml-song-subtitle">
        <span className="ml-song-artist">{artist}</span>
        {badges.length > 0 && (
            <span className="ml-audio-specs" title={description} aria-label={description}>
                {badges.map(badge => <span key={badge.id} className="ml-audio-spec" data-spec={badge.id} aria-hidden="true">{badge.label}</span>)}
            </span>
        )}
    </small>;
}

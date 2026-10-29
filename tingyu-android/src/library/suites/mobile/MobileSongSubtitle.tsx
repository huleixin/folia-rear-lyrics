import type { TFunction } from 'i18next';
import type { SongResult } from '../../../types';
import { getCatalogAudioLabels } from '../../../utils/catalogAudioLabels';

// src/library/suites/mobile/MobileSongSubtitle.tsx
export default function MobileSongSubtitle({ artist, song, t }: { artist: string; song: Pick<SongResult, 'catalogAudioSpecs'>; t: TFunction }) {
    const labels = getCatalogAudioLabels(song, t);
    if (!labels.length) return <small>{artist}</small>;
    const description = t('catalogAudioSpecs.description', { specs: labels.join(' / ') });
    return <small className="ml-song-subtitle">
        <span className="ml-song-artist">{artist}</span>
        <span className="ml-audio-specs" aria-label={description} title={description}>
            {labels.map(label => <span className="ml-audio-spec" key={label}>{label}</span>)}
        </span>
    </small>;
}

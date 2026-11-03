import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppOverlaysModel } from '../buildAppOverlaysModel';
import MinimalArtwork from './MinimalArtwork';
import { resolveQualityBadges } from './minimalQuality';
import { usePlaybackStore } from '../../../../stores/usePlaybackStore';

// src/components/app/overlays/minimal-stage/MinimalCoverPage.tsx
// Left phone of the reference: artwork as the centre of the page, then the song, then the chips.
//
// The page owns no state. Title, artist, artwork and the audio source all come from the same
// playback model the rest of the app reads, so a provider change (online, local, cached) only
// changes the data — never the layout.

type Controls = NonNullable<AppOverlaysModel['floatingControls']>;

export default function MinimalCoverPage({
    song,
    controls,
}: {
    song: { title: string; artist: string; coverUrl: string | null } | null;
    controls: Controls;
}) {
    const { t } = useTranslation();
    // The chip row asks the playback store for the catalog specs rather than the control model:
    // the control model deliberately carries only what a control needs, and provider capability is
    // not one of those things.
    const specs = usePlaybackStore(state => state.currentSong?.catalogAudioSpecs);
    const badges = useMemo(
        () => resolveQualityBadges(specs, controls.audioSrc),
        [specs, controls.audioSrc],
    );
    const title = song?.title || t('mobileLibrary.nothingPlaying');
    const artist = song?.artist || '';

    return (
        <div className="min-cover" data-testid="minimal-cover-page">
            <div className="min-cover__art">
                <MinimalArtwork url={song?.coverUrl ?? null} alt={title} />
            </div>
            <div className="min-cover__meta">
                <h2 className="min-cover__title" title={title}>{title}</h2>
                {artist && <p className="min-cover__artist" title={artist}>{artist}</p>}
                {badges.length > 0 && (
                    <ul className="min-chips" aria-label={t('mobileStage.audioQuality')}>
                        {badges.map(badge => (
                            <li
                                key={badge.id}
                                className="min-chip"
                                data-tone={badge.tone}
                                title={badge.id === 'spec'
                                    ? t('catalogAudioSpecs.description', { specs: t(`catalogAudioSpecs.${badge.value}`) })
                                    : undefined}
                            >
                                {badge.id === 'spec' ? t(`catalogAudioSpecs.${badge.value}`) : badge.value}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

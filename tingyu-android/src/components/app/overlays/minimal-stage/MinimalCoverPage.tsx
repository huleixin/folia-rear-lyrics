import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppOverlaysModel } from '../buildAppOverlaysModel';
import MinimalArtwork from './MinimalArtwork';
import MinimalArtistLink from './MinimalArtistLink';
import { resolveQualityBadges } from './minimalQuality';
import { usePlaybackStore } from '../../../../stores/usePlaybackStore';

// src/components/app/overlays/minimal-stage/MinimalCoverPage.tsx
// Left phone of the reference: the sleeve, then the song, then the caption row.
//
// Everything is left-aligned on one column — the same left edge as the artwork, the title and the
// progress bar. That single alignment is most of the difference between "a player screen" and "a
// record sleeve"; the earlier centred block had nothing to line up with.
//
// The page owns no state. Title, artist, artwork and the audio source all come from the same
// playback model the rest of the app reads, so a provider change (online, local, cached) only
// changes the data — never the layout.

type Controls = NonNullable<AppOverlaysModel['floatingControls']>;

/** Bar heights as a fraction of the indicator; four bars read as a meter, five as a graphic. */
const WAVE_BARS = [0.44, 0.8, 1, 0.56];

/**
 * The playing indicator beside the caption.
 *
 * It is decorated, not a control: `aria-hidden`, no tap target. It stops dead when the transport
 * is not playing — a moving bar chart on a paused song is a lie, and it is also four compositor
 * animations nobody asked for.
 */
function PlayingMeter({ playing }: { playing: boolean }) {
    return (
        <span className="min-wave" data-paused={playing ? undefined : ''} aria-hidden="true">
            {WAVE_BARS.map((height, index) => (
                <i
                    key={index}
                    style={{
                        '--h': `${Math.round(height * 100)}%`,
                        animationDelay: `${index * -0.46}s`,
                        animationDuration: `${2.1 + index * 0.19}s`,
                    } as React.CSSProperties}
                />
            ))}
        </span>
    );
}

export default function MinimalCoverPage({
    song,
    controls,
    onOpenArtist,
    playing,
    sleeveRef,
    metaRef,
}: {
    song: { title: string; artist: string; coverUrl: string | null } | null;
    controls: Controls;
    onOpenArtist?: NonNullable<AppOverlaysModel['mobileStage']>['onOpenArtist'];
    playing: boolean;
    /** The sleeve wrapper; the gesture frame writes its parallax offset here. */
    sleeveRef?: React.Ref<HTMLDivElement>;
    /** The title block; the gesture frame fades it as the page leaves. */
    metaRef?: React.Ref<HTMLDivElement>;
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
    // One caption, not two badges: "FLAC · 无损" is a description of the recording, and the
    // reference sets it as a single line of small type.
    const quality = badges.length
        ? badges
            .map(badge => (badge.id === 'spec' ? t(`catalogAudioSpecs.${badge.value}`) : badge.value))
            .join(' · ')
        : null;
    const tone = badges.some(badge => badge.tone === 'gold') ? 'gold' : 'plain';

    return (
        <div className="min-cover" data-testid="minimal-cover-page">
            <div className="min-cover__stage" ref={sleeveRef}>
                {/* The second print behind the sleeve. */}
                <span className="min-cover__ghost" aria-hidden="true" />
                <div className="min-cover__art">
                    <MinimalArtwork url={song?.coverUrl ?? null} alt={title} />
                </div>
            </div>
            <div className="min-cover__meta" ref={metaRef}>
                <h2 className="min-cover__title" title={title}>{title}</h2>
                <MinimalArtistLink label={artist} className="min-cover__artist" onOpen={onOpenArtist} />
                <div className="min-cover__foot">
                    {quality && (
                        <span className="min-chip" data-tone={tone}>{quality}</span>
                    )}
                    <PlayingMeter playing={playing} />
                </div>
            </div>
        </div>
    );
}

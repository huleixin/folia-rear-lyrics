import React, { useLayoutEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppOverlaysModel } from '../buildAppOverlaysModel';
import MinimalArtistLink from './MinimalArtistLink';
import MinimalLiveLyric from './MinimalLiveLyric';
import { MinimalArtworkFrame } from './MinimalArtwork';
import { resolveQualityBadges } from './minimalQuality';
import type { LyricData } from '../../../../types';
import type { CatalogAudioSpec } from '../../../../types/catalogAudioSpecs';
import { getPlaybackSongKey } from '../../../../utils/appPlaybackGuards';
import { useMinimalArtwork } from './useMinimalArtwork';
import { useMinimalCoverTransition, type MinimalCoverSnapshot } from './useMinimalCoverTransition';
import { navigationMark } from '../../../../services/navigationTiming';

// src/components/app/overlays/minimal-stage/MinimalCoverPage.tsx
// A stable sleeve, with artwork and caption snapshots switched as one playback identity.

type Controls = NonNullable<AppOverlaysModel['floatingControls']>;
type CoverSong = NonNullable<AppOverlaysModel['mobileStage']>['song'];

/** Bar heights as a fraction of the indicator; four bars read as a meter, five as a graphic. */
const WAVE_BARS = [0.44, 0.8, 1, 0.56];

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

interface CoverSnapshot extends MinimalCoverSnapshot {
    song: CoverSong;
    audioSrc: string | null;
    specs: readonly CatalogAudioSpec[] | null | undefined;
    artworkFailed: boolean;
    artworkImage: HTMLImageElement | null;
}

function CoverMetadata({
    snapshot,
    playing,
    onOpenArtist,
    className,
    metaRef,
}: {
    snapshot: CoverSnapshot;
    playing: boolean;
    onOpenArtist?: NonNullable<AppOverlaysModel['mobileStage']>['onOpenArtist'];
    className: string;
    metaRef?: React.Ref<HTMLDivElement>;
}) {
    const { t } = useTranslation();
    const badges = useMemo(
        () => resolveQualityBadges(snapshot.specs, snapshot.audioSrc),
        [snapshot.specs, snapshot.audioSrc],
    );
    const title = snapshot.song?.title || t('mobileLibrary.nothingPlaying');
    const artist = snapshot.song?.artist || '';
    const quality = badges.length
        ? badges
            .map(badge => (badge.id === 'spec' ? t(`catalogAudioSpecs.${badge.value}`) : badge.value))
            .join(' · ')
        : null;
    const tone = badges.some(badge => badge.tone === 'gold') ? 'gold' : 'plain';

    return (
        <div className={className} ref={metaRef}>
            <h2 className="min-cover__title" title={title}>{title}</h2>
            <MinimalArtistLink label={artist} track={snapshot.song?.track ?? null} className="min-cover__artist" onOpen={onOpenArtist} />
            <div className="min-cover__foot">
                {quality && <span className="min-chip" data-tone={tone}>{quality}</span>}
                <PlayingMeter playing={playing} />
            </div>
        </div>
    );
}

export default function MinimalCoverPage({
    song,
    controls,
    onOpenArtist,
    lyrics,
    lyricActive,
    onOpenLyrics,
    playing,
    animateSongChanges = true,
    reducedMotion = false,
    onPresentedCover,
    sleeveRef,
    metaRef,
}: {
    song: CoverSong;
    controls: Controls;
    onOpenArtist?: NonNullable<AppOverlaysModel['mobileStage']>['onOpenArtist'];
    lyrics: LyricData | null;
    lyricActive: boolean;
    onOpenLyrics: () => void;
    playing: boolean;
    animateSongChanges?: boolean;
    reducedMotion?: boolean;
    onPresentedCover?: (source: string | null) => void;
    /** The sleeve wrapper; the gesture frame writes its parallax offset here. */
    sleeveRef?: React.Ref<HTMLDivElement>;
    /** The title block; the gesture frame fades it as the page leaves. */
    metaRef?: React.Ref<HTMLDivElement>;
}) {
    const { t } = useTranslation();
    const specs = song?.track?.catalogAudioSpecs;
    const coverUrl = song?.coverUrl ?? null;
    const artwork = useMinimalArtwork(coverUrl, song?.track);
    const songKey = song?.track ? getPlaybackSongKey(song.track) : song?.title ?? '';
    const latest = useMemo<CoverSnapshot>(() => ({
        key: songKey,
        artKey: coverUrl ?? '',
        song,
        coverSource: artwork.source,
        artworkFailed: artwork.failed,
        artworkImage: artwork.image,
        audioSrc: controls.audioSrc ?? null,
        specs,
    }), [songKey, coverUrl, song, artwork.source, artwork.image, artwork.failed, controls.audioSrc, specs]);
    const artworkReady = artwork.source !== null || artwork.failed;
    const { current, previous } = useMinimalCoverTransition(
        latest,
        artworkReady,
        animateSongChanges && !reducedMotion,
    );
    useLayoutEffect(() => {
        if (current.key === songKey && artworkReady) {
            navigationMark('minimal-cover-presentation-commit');
            onPresentedCover?.(current.coverSource);
        }
    }, [current.key, current.coverSource, songKey, artworkReady, onPresentedCover]);

    const titleFor = (snapshot: CoverSnapshot) => snapshot.song?.title || t('mobileLibrary.nothingPlaying');
    const showPreviousArt = !!previous && !!previous.coverSource && (
        previous.coverSource !== current.coverSource
    );
    const showPreviousMeta = !!previous && previous.key !== current.key;
    const handleCurrentArtworkError = () => {
        if (current.key === songKey) artwork.recover();
    };

    return (
        <div className="min-cover" data-testid="minimal-cover-page">
            <div className="min-cover__stage" ref={sleeveRef}>
                {/* One continuous paper layer stays behind both images during a crossfade. */}
                <span className="min-cover__ghost" aria-hidden="true" />
                <div className="min-cover__art" data-testid="minimal-cover-art">
                    {showPreviousArt && previous && (
                        <MinimalArtworkFrame
                            key={`image:${previous.coverSource}`}
                            source={previous.coverSource}
                            image={previous.artworkImage}
                            failed={previous.artworkFailed}
                            alt={titleFor(previous)}
                            className="min-cover__art-layer min-cover__art-layer--outgoing"
                        />
                    )}
                    <MinimalArtworkFrame
                        // The outgoing layer keeps this same key and decoded image node. It must
                        // not re-request a previous song's blob URL after its owner revokes it.
                        key={`image:${current.coverSource}`}
                        source={current.coverSource}
                        image={current.artworkImage}
                        failed={current.artworkFailed}
                        alt={titleFor(current)}
                        className={`min-cover__art-layer min-cover__art-layer--current${showPreviousArt ? ' min-cover__art-layer--incoming' : ''}`}
                        onError={handleCurrentArtworkError}
                    />
                </div>
            </div>

            <div className="min-cover__meta-stack" ref={metaRef}>
                <CoverMetadata
                    snapshot={current}
                    playing={playing}
                    onOpenArtist={current.key === songKey ? onOpenArtist : undefined}
                    className={`min-cover__meta${showPreviousMeta ? ' min-cover__meta--incoming' : ''}`}
                />
            </div>

            <MinimalLiveLyric
                lyrics={lyrics}
                songKey={song?.track ? getPlaybackSongKey(song.track) : song?.title ?? ''}
                active={lyricActive && current.key === songKey}
                reserveSpace={current.key !== songKey || (lyricActive && !!lyrics?.lines?.length)}
                onOpen={onOpenLyrics}
            />
        </div>
    );
}

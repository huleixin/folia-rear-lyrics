import type { CatalogAudioSpec } from '../../../../types/catalogAudioSpecs';

// src/components/app/overlays/minimal-stage/minimalQuality.ts
// The two quality chips under the song title.
//
// 听屿 already distinguishes two very different facts, and the chip row must not blur them:
//   · the container of the bytes actually being played — read off the stream URL, and true;
//   · the platform's catalog capability — a claim about what the provider *offers*, never about the
//     stream in hand.
// So the container chip comes first and the catalog chip second, and a song with neither shows
// nothing rather than a placeholder.

export type QualityBadge = {
    id: 'container' | 'spec';
    /** Either a literal container label (FLAC) or a `catalogAudioSpecs.*` i18n key. */
    value: string;
    tone: 'plain' | 'gold';
};

const CONTAINERS: Record<string, { label: string; tone: QualityBadge['tone'] }> = {
    flac: { label: 'FLAC', tone: 'plain' },
    ape: { label: 'APE', tone: 'plain' },
    wav: { label: 'WAV', tone: 'plain' },
    dsf: { label: 'DSD', tone: 'plain' },
    dff: { label: 'DSD', tone: 'plain' },
    mp3: { label: 'MP3', tone: 'plain' },
    m4a: { label: 'AAC', tone: 'plain' },
    aac: { label: 'AAC', tone: 'plain' },
    ogg: { label: 'OGG', tone: 'plain' },
    opus: { label: 'OPUS', tone: 'plain' },
    wma: { label: 'WMA', tone: 'plain' },
};

/** Lossless containers no longer say anything about the provider, so they also read as "无损". */
const LOSSLESS_CONTAINERS = new Set(['flac', 'ape', 'wav', 'dsf', 'dff']);

const extensionOf = (url: string): string | null => {
    const withoutQuery = url.split(/[?#]/, 1)[0];
    const match = /\.([a-z0-9]{2,4})$/i.exec(withoutQuery);
    return match ? match[1].toLowerCase() : null;
};

/** The container of the stream in hand, or null when the URL carries no extension (most providers). */
export const resolveContainerBadge = (audioSrc: string | null | undefined): QualityBadge | null => {
    if (!audioSrc) {
        return null;
    }
    const extension = extensionOf(audioSrc);
    const container = extension ? CONTAINERS[extension] : undefined;
    if (!container) {
        return null;
    }
    return { id: 'container', value: container.label, tone: container.tone };
};

export const isLosslessContainer = (audioSrc: string | null | undefined): boolean => {
    const extension = audioSrc ? extensionOf(audioSrc) : null;
    return Boolean(extension && LOSSLESS_CONTAINERS.has(extension));
};

const SPEC_PRIORITY: readonly CatalogAudioSpec[] = ['hires', 'lossless', 'dolby', 'dts'];

/**
 * At most two chips, container first.
 *
 * `hires` is only claimed when the catalog says so *and* the stream is a lossless container —
 * otherwise the chip would be describing the provider's menu while the listener hears 128 kbps.
 */
export const resolveQualityBadges = (
    catalogAudioSpecs: readonly CatalogAudioSpec[] | null | undefined,
    audioSrc: string | null | undefined,
): QualityBadge[] => {
    const badges: QualityBadge[] = [];
    const container = resolveContainerBadge(audioSrc);
    if (container) {
        badges.push(container);
    }
    const specs = catalogAudioSpecs ?? [];
    const lossless = isLosslessContainer(audioSrc);
    const spec = SPEC_PRIORITY.find(candidate => specs.includes(candidate)
        && (candidate !== 'hires' || lossless)
        && (candidate !== 'lossless' || lossless));
    if (spec) {
        badges.push({ id: 'spec', value: spec, tone: spec === 'hires' ? 'gold' : 'plain' });
    }
    return badges.slice(0, 2);
};

import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { Artist } from '../../../../types';
import { usePlaybackStore } from '../../../../stores/usePlaybackStore';
import { canResolveSongCatalogRef } from '../../../../services/onlineMusic/catalogRefs';
import { resolveTrackArtistLinks } from '../../../../library/core/model/trackLinks';

// src/components/app/overlays/minimal-stage/MinimalArtistLink.tsx
// Use catalog identities, never a display caption, for both minimal player pages.
export default function MinimalArtistLink({ label, className, onOpen }: {
    label: string; className: string; onOpen?: (artist: Artist) => void;
}) {
    const track = usePlaybackStore(state => state.currentSong);
    const links = track ? resolveTrackArtistLinks(track, canResolveSongCatalogRef) : [];
    if (!label) return null;
    return <div className={className} title={label}>
        {links.length ? links.map(({artist, targetId}, index) => targetId !== undefined && onOpen
            ? <button type="button" className="min-artist-link" key={`${targetId}:${index}`}
                onClick={() => onOpen(artist)}><span>{artist.name}</span><ChevronRight size={13} aria-hidden="true" /></button>
            : <span key={index}>{artist.name}</span>) : <span>{label}</span>}
    </div>;
}

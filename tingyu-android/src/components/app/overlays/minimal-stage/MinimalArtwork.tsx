import React from 'react';
import { Music2 } from 'lucide-react';
import type { SongResult } from '../../../../types';
import { useMinimalArtwork } from './useMinimalArtwork';

// src/components/app/overlays/minimal-stage/MinimalArtwork.tsx
// The same decoded, identity-checked source feeds the cover and the lyric thumbnail.
export default function MinimalArtwork({url,alt,className,track}: {
    url:string|null; alt:string; className?:string; track?:SongResult|null;
}) {
    const {source,failed,recover} = useMinimalArtwork(url,track);
    return <MinimalArtworkFrame source={source} failed={failed} alt={alt} className={className} onError={recover} />;
}

export function MinimalArtworkFrame({source,failed=false,alt,className,onError}: {
    source:string|null; failed?:boolean; alt:string; className?:string; onError?:()=>void;
}) {
    return <div className={['min-art',className].filter(Boolean).join(' ')} data-artwork-state={source?'ready':failed?'unavailable':'loading'}>
        <span className="min-art__empty" style={{visibility:source ? 'hidden' : undefined}} role={source ? undefined : 'img'} aria-label={source ? undefined : alt} aria-hidden={source || !alt ? true : undefined}>
            <Music2 size={40} strokeWidth={1.4} aria-hidden="true" />
        </span>
        {source && <img key={source} className="min-art__img" src={source} alt={alt}
            data-top="true" draggable={false} decoding="async" onError={onError} />}
    </div>;
}

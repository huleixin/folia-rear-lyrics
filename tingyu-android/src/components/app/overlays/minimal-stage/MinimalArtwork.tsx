import React, { useLayoutEffect, useRef } from 'react';
import { Music2 } from 'lucide-react';
import type { SongResult } from '../../../../types';
import { useMinimalArtwork } from './useMinimalArtwork';
import { navigationMark } from '../../../../services/navigationTiming';

// src/components/app/overlays/minimal-stage/MinimalArtwork.tsx
// The same decoded, identity-checked source feeds the cover and the lyric thumbnail.
export default function MinimalArtwork({url,alt,className,track}: {
    url:string|null; alt:string; className?:string; track?:SongResult|null;
}) {
    const {source,image,failed,recover} = useMinimalArtwork(url,track);
    return <MinimalArtworkFrame source={source} image={image} failed={failed} alt={alt} className={className} onError={recover} />;
}

export function MinimalArtworkFrame({source,image,failed=false,alt,className,onError}: {
    source:string|null; image?:HTMLImageElement|null; failed?:boolean; alt:string; className?:string; onError?:()=>void;
}) {
    const slot = useRef<HTMLSpanElement>(null);
    const error = useRef(onError); error.current = onError;
    useLayoutEffect(() => {
        const host = slot.current;
        if (!image || !host) return;
        // Mount the exact decoded node. A second <img src> would reopen the load/paint race.
        image.className = 'min-art__img'; image.dataset.top = 'true'; image.draggable = false;
        host.appendChild(image);
        navigationMark('minimal-cover-dom-attached');
        const failed = () => error.current?.();
        image.addEventListener('error', failed);
        return () => { image.removeEventListener('error', failed); if (image.parentNode === host) host.removeChild(image); };
    }, [image]);
    useLayoutEffect(() => { if (image) image.alt = alt; }, [image, alt]);
    return <div className={['min-art',className].filter(Boolean).join(' ')} data-artwork-state={source?'ready':failed?'unavailable':'loading'}>
        <span className="min-art__empty" style={{visibility:source ? 'hidden' : undefined}} role={source ? undefined : 'img'} aria-label={source ? undefined : alt} aria-hidden={source || !alt ? true : undefined}>
            <Music2 size={40} strokeWidth={1.4} aria-hidden="true" />
        </span>
        {image ? <span className="min-art__image-slot" ref={slot} /> : source && <img key={source} className="min-art__img" src={source} alt={alt}
            data-top="true" draggable={false} decoding="async" onError={onError} />}
    </div>;
}

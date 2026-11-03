import React, { useEffect, useRef, useState } from 'react';
import { Music2 } from 'lucide-react';

// src/components/app/overlays/minimal-stage/MinimalArtwork.tsx
// A 1:1 cover that never blinks between tracks.
//
// Swapping `src` on one <img> is what makes a cover flash: the element paints empty for the frame
// between the attribute change and the decode. So the incoming artwork is decoded first and only
// then pushed on top, with the outgoing one still painted underneath until the fade finishes.

const FADE_MS = 320;
const MAX_STACK = 2;

export default function MinimalArtwork({
    url,
    alt,
    className,
}: {
    url: string | null;
    alt: string;
    className?: string;
}) {
    const [stack, setStack] = useState<string[]>(() => (url ? [url] : []));
    const urlRef = useRef(url);
    const timer = useRef(0);

    useEffect(() => {
        urlRef.current = url;
        if (!url) {
            setStack([]);
            return;
        }
        let alive = true;
        const image = new Image();
        const commit = () => {
            if (!alive || urlRef.current !== url) {
                return;
            }
            setStack(previous => (previous[previous.length - 1] === url ? previous : [...previous, url].slice(-MAX_STACK)));
            window.clearTimeout(timer.current);
            // The older layer is kept only for the length of the crossfade.
            timer.current = window.setTimeout(() => {
                setStack(previous => (previous.length > 1 ? previous.slice(-1) : previous));
            }, FADE_MS);
        };
        image.onload = commit;
        // A broken cover must not replace a working one; with an empty stack the placeholder shows.
        image.onerror = () => { /* keep whatever is painted */ };
        image.src = url;
        if (image.complete && image.naturalWidth > 0) {
            commit();
        }
        return () => {
            alive = false;
            window.clearTimeout(timer.current);
        };
    }, [url]);

    return (
        <div className={['min-art', className].filter(Boolean).join(' ')}>
            {stack.map((source, index) => (
                <img
                    key={source}
                    className="min-art__img"
                    src={source}
                    alt={index === stack.length - 1 ? alt : ''}
                    aria-hidden={index === stack.length - 1 ? undefined : true}
                    data-top={index === stack.length - 1 || undefined}
                    draggable={false}
                    decoding="async"
                />
            ))}
            {stack.length === 0 && (
                <span className="min-art__empty" role="img" aria-label={alt}>
                    <Music2 size={40} strokeWidth={1.4} aria-hidden="true" />
                </span>
            )}
        </div>
    );
}

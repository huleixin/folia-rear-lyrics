import React, { useEffect, useRef, useState } from 'react';
import { Music2 } from 'lucide-react';

// src/components/app/overlays/minimal-stage/MinimalArtwork.tsx
// A 1:1 cover that never blinks between tracks — and never appears half-drawn on the way in.
//
// Two rules, and they are both about the frame the bitmap is not in:
//   · swapping `src` on one <img> makes a cover flash, because the element paints empty for the frame
//     between the attribute change and the decode;
//   · *mounting* an <img> with a src is the same problem. The element is in the tree with
//     `opacity: 1` before the bitmap exists, so the sleeve paints as a blank plate and the artwork
//     snaps into it a frame or two later. That is the flicker at the top of the player page, and it
//     was here because the first url was seeded into the stack instead of being decoded first.
//
// So the stack starts empty, every artwork is decoded off-screen before it is put in the DOM, and it
// is then lifted from 0 to 1 over one frame's delay so the fade has a starting value. The plate
// behind it (`.min-art`) is already painted, so there is never a hole — only a dissolve.

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
    /** Urls currently in the DOM, oldest first. The last one is on top. */
    const [stack, setStack] = useState<string[]>([]);
    /** The url the top layer is allowed to be opaque. Set one frame after it is inserted. */
    const [lit, setLit] = useState<string | null>(null);
    const urlRef = useRef(url);
    const timer = useRef(0);
    const frame = useRef(0);

    useEffect(() => {
        urlRef.current = url;
        if (!url) {
            setStack([]);
            setLit(null);
            return;
        }
        let alive = true;
        const image = new Image();
        const commit = () => {
            if (!alive || urlRef.current !== url) {
                return;
            }
            setStack(previous => (previous[previous.length - 1] === url ? previous : [...previous, url].slice(-MAX_STACK)));
            // One frame at zero opacity first. Flipping it in the same commit as the insert would
            // paint the new sleeve at full opacity immediately, and a crossfade that starts at the
            // destination is a cut.
            window.cancelAnimationFrame(frame.current);
            frame.current = window.requestAnimationFrame(() => {
                if (alive) {
                    setLit(url);
                }
            });
            window.clearTimeout(timer.current);
            // The older layer is kept only for the length of the crossfade.
            timer.current = window.setTimeout(() => {
                setStack(previous => (previous.length > 1 ? previous.slice(-1) : previous));
            }, FADE_MS);
        };
        image.onload = commit;
        // A broken cover must not replace a working one; with an empty stack the plate shows.
        image.onerror = () => { /* keep whatever is painted */ };
        image.src = url;
        if (image.complete && image.naturalWidth > 0) {
            commit();
        }
        return () => {
            alive = false;
            window.cancelAnimationFrame(frame.current);
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
                    data-top={source === lit || undefined}
                    draggable={false}
                    decoding="async"
                />
            ))}
            {/* Only when there is no artwork at all. An url that has not decoded yet is not "no
                cover": it is a sleeve whose print has not landed, and the plate says that better
                than a centred music note appearing and leaving. */}
            {stack.length === 0 && !url && (
                <span className="min-art__empty" role="img" aria-label={alt}>
                    <Music2 size={40} strokeWidth={1.4} aria-hidden="true" />
                </span>
            )}
        </div>
    );
}

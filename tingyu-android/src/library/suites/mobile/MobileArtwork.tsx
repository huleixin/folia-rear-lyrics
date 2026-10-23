import React from 'react';
import { Disc3 } from 'lucide-react';

// src/library/suites/mobile/MobileArtwork.tsx
export default function MobileArtwork({
    src,
    className = '',
    priority = false,
}: {
    src?: string | null;
    className?: string;
    priority?: boolean;
}) {
    return (
        <span className={`ml-art ${className}`} aria-hidden="true">
            <Disc3 size={26} />
            {src && (
                <img
                    key={src}
                    src={src}
                    alt=""
                    loading={priority ? 'eager' : 'lazy'}
                    decoding="async"
                    onError={(event) => {
                        event.currentTarget.hidden = true;
                    }}
                />
            )}
        </span>
    );
}

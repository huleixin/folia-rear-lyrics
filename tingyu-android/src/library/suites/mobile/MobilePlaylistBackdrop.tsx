import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { extractRepresentativeColors } from '../../../utils/colorExtractor';
import { getSizedCoverUrl } from '../../../utils/coverUrl';

// src/library/suites/mobile/MobilePlaylistBackdrop.tsx
// 每个封面只分析一次 50×50 像素；并发复用及有界缓存避免切页重复取色。
const paletteCache = new Map<string, Promise<string>>();
const FALLBACK = '#254c3f';
function coverColor(url: string): Promise<string> {
    const saved = paletteCache.get(url);
    if (saved) return saved;
    const pending = extractRepresentativeColors(url, 3)
        .then(colors => colors[0] || FALLBACK).catch(() => FALLBACK);
    paletteCache.set(url, pending);
    if (paletteCache.size > 40) paletteCache.delete(paletteCache.keys().next().value!);
    return pending;
}

export default function MobilePlaylistBackdrop({ cover }: { cover?: string }) {
    const reducedMotion = useReducedMotion();
    const image = cover ? getSizedCoverUrl(cover, 240) : '';
    const [ambient, setAmbient] = useState(FALLBACK);
    useEffect(() => {
        let active = true;
        if (!image) { setAmbient(FALLBACK); return; }
        void coverColor(image).then(color => { if (active) setAmbient(color); });
        return () => { active = false; };
    }, [image]);
    return <div className="ml-playlist-backdrop" aria-hidden="true">
        <motion.div className="ml-playlist-ambient" initial={false} animate={{ backgroundColor: ambient }} transition={{ duration: reducedMotion ? 0 : 0.6 }} />
        <AnimatePresence initial={false}>
            {image && <motion.img key={image} src={image} alt="" decoding="async"
                initial={{ opacity: 0 }} animate={{ opacity: 0.2 }} exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.6 }}
                onError={event => { event.currentTarget.hidden = true; }} />}
        </AnimatePresence>
    </div>;
}

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { LyricData } from '../../../../types';
import { lyricCurrentTime } from '../../../../stores/motionSignals';
import { buildLineStarts, findActiveLineIndex } from './minimalLyrics';

// src/components/app/overlays/minimal-stage/MinimalLiveLyric.tsx
// A compact cover-page lyric readout; it shares the resolved lyric timeline and clock with the stage.

const EMPTY_LINES: NonNullable<LyricData['lines']> = [];

type Selection = { songKey: string; lines: LyricData['lines']; index: number };

export default function MinimalLiveLyric({
    lyrics,
    songKey,
    active,
    reserveSpace = false,
    onOpen,
}: {
    lyrics: LyricData | null;
    songKey: string;
    active: boolean;
    reserveSpace?: boolean;
    onOpen: () => void;
}) {
    const { t } = useTranslation();
    const lines = lyrics?.lines ?? EMPTY_LINES;
    const starts = useMemo(() => buildLineStarts(lines), [lines]);
    const [selection, setSelection] = useState<Selection>({ songKey: '', lines: EMPTY_LINES, index: -1 });

    useEffect(() => {
        if (!active || !lines.length) {
            return;
        }
        let lastIndex = -2;
        const update = (time: number) => {
            const index = findActiveLineIndex(starts, time);
            if (index === lastIndex) {
                return;
            }
            lastIndex = index;
            setSelection({ songKey, lines, index });
        };
        update(lyricCurrentTime.get());
        return lyricCurrentTime.on('change', update);
    }, [active, lines, songKey, starts]);

    const index = selection.songKey === songKey && selection.lines === lines ? selection.index : -1;
    const line = index >= 0 ? lines[index] : null;
    const text = line?.fullText?.trim();
    if (!active || !songKey || !text) {
        if (reserveSpace) return <div className="min-live-lyric" aria-hidden="true" />;
        return null;
    }

    return (
        <div className="min-live-lyric" data-testid="minimal-live-lyric">
            <AnimatePresence mode="wait" initial={false}>
                <motion.button
                    key={`${songKey}:${index}`}
                    type="button"
                    className="min-live-lyric__text"
                    title={text}
                    aria-label={`${t('minimalStage.openLyrics')}: ${text}`}
                    onClick={onOpen}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.28, ease: [0.22, 0.68, 0.2, 1] }}
                >
                    <span className="min-live-lyric__copy">{text}</span>
                </motion.button>
            </AnimatePresence>
        </div>
    );
}

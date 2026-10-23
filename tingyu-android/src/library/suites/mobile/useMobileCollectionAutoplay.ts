import { useEffect, useRef } from 'react';
import { useMobileLibraryStore } from '../../../stores/useMobileLibraryStore';

// src/library/suites/mobile/useMobileCollectionAutoplay.ts
// The hero play button opens the normal collection resource, then plays through the normal port exactly once.
export function useMobileCollectionAutoplay(
    key: string,
    status: string | undefined,
    playableCount: number,
    play: () => void
) {
    const pending = useMobileLibraryStore((state) => state.pendingCollectionPlay);
    const disposal = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (disposal.current !== null) clearTimeout(disposal.current);
        return () => {
            disposal.current = setTimeout(() => useMobileLibraryStore.getState().cancelCollectionPlay(key), 0);
        };
    }, [key]);
    useEffect(() => {
        if (!pending || pending.key !== key || (status !== 'ready' && status !== 'error')) return;
        if (!useMobileLibraryStore.getState().consumeCollectionPlay(pending.token)) return;
        if (status === 'ready' && playableCount > 0) play();
    }, [key, pending, status, playableCount, play]);
}

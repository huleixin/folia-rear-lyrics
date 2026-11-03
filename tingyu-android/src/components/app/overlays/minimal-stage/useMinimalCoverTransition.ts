import { useEffect, useRef, useState } from 'react';

// src/components/app/overlays/minimal-stage/useMinimalCoverTransition.ts
// Keep the cover and its caption on one playback identity while the next image is decoded.
// State contains at most two snapshots; a newer skip replaces the outgoing snapshot.

export interface MinimalCoverSnapshot {
    key: string;
    artKey: string;
    coverSource: string | null;
}

interface TransitionState<T> {
    current: T;
    previous: T | null;
}

const CROSSFADE_MS = 420;
const sameIdentity = (left: MinimalCoverSnapshot, right: MinimalCoverSnapshot) =>
    left.key === right.key && left.artKey === right.artKey;

export function useMinimalCoverTransition<T extends MinimalCoverSnapshot>(
    latest: T,
    artworkReady: boolean,
    animationEnabled: boolean,
): TransitionState<T> {
    const [state, setState] = useState<TransitionState<T>>(() => ({ current: latest, previous: null }));
    const stateRef = useRef(state);
    const clearPreviousRef = useRef<number | null>(null);
    stateRef.current = state;

    useEffect(() => {
        const clearPrevious = () => {
            if (clearPreviousRef.current !== null) window.clearTimeout(clearPreviousRef.current);
            clearPreviousRef.current = null;
        };
        const commit = (snapshot: T, animate: boolean) => {
            clearPrevious();
            setState(current => {
                if (sameIdentity(current.current, snapshot)) {
                    return { ...current, current: snapshot, ...(!animate ? { previous: null } : {}) };
                }
                return { current: snapshot, previous: animate ? current.current : null };
            });
            if (animate) {
                clearPreviousRef.current = window.setTimeout(() => {
                    clearPreviousRef.current = null;
                    setState(current => sameIdentity(current.current, snapshot)
                        ? { ...current, previous: null }
                        : current);
                }, CROSSFADE_MS);
            }
        };

        const visible = stateRef.current.current;
        if (sameIdentity(visible, latest)) {
            if (!artworkReady && visible.coverSource) return;
            if (artworkReady && visible.coverSource && latest.coverSource !== visible.coverSource) {
                commit(latest, animationEnabled);
                return;
            }
            if (!animationEnabled && stateRef.current.previous) clearPrevious();
            setState(current => {
                if (current.current === latest && (animationEnabled || !current.previous)) return current;
                return { current: latest, previous: animationEnabled ? current.previous : null };
            });
            return;
        }

        if (artworkReady) {
            commit(latest, animationEnabled);
            return;
        }
        // Readiness is a decoded picture or a terminal loader failure, never a UI timeout.
        // Keep the matched old sleeve/caption until the next presentation can be committed.
    }, [latest, artworkReady, animationEnabled]);

    useEffect(() => () => {
        if (clearPreviousRef.current !== null) window.clearTimeout(clearPreviousRef.current);
        clearPreviousRef.current = null;
    }, []);

    return state;
}

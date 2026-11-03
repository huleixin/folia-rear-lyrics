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

const IMAGE_WAIT_MS = 680;
const CROSSFADE_MS = 420;
const sameIdentity = (left: MinimalCoverSnapshot, right: MinimalCoverSnapshot) =>
    left.key === right.key && left.artKey === right.artKey;

export function useMinimalCoverTransition<T extends MinimalCoverSnapshot>(
    latest: T,
    artworkReady: boolean,
    animationEnabled: boolean,
): TransitionState<T> {
    const [state, setState] = useState<TransitionState<T>>(() => ({ current: latest, previous: null }));
    const latestRef = useRef(latest);
    const stateRef = useRef(state);
    const pendingRef = useRef<{ identity: string; timer: number } | null>(null);
    const clearPreviousRef = useRef<number | null>(null);
    latestRef.current = latest;
    stateRef.current = state;

    useEffect(() => {
        const clearPending = () => {
            if (pendingRef.current) window.clearTimeout(pendingRef.current.timer);
            pendingRef.current = null;
        };
        const clearPrevious = () => {
            if (clearPreviousRef.current !== null) window.clearTimeout(clearPreviousRef.current);
            clearPreviousRef.current = null;
        };
        const commit = (snapshot: T, animate: boolean) => {
            clearPrevious();
            clearPending();
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
            if (pendingRef.current) clearPending();
            if (!animationEnabled && stateRef.current.previous) clearPrevious();
            setState(current => {
                if (current.current === latest && (animationEnabled || !current.previous)) return current;
                return { current: latest, previous: animationEnabled ? current.previous : null };
            });
            return;
        }

        if (!animationEnabled) {
            commit(latest, false);
            return;
        }
        if (artworkReady) {
            commit(latest, true);
            return;
        }

        const identity = `${latest.key}\n${latest.artKey}`;
        if (pendingRef.current?.identity === identity) return;
        clearPending();
        const timer = window.setTimeout(() => {
            pendingRef.current = null;
            const candidate = latestRef.current;
            if (sameIdentity(candidate, latest)) commit(candidate, true);
        }, IMAGE_WAIT_MS);
        pendingRef.current = { identity, timer };
    }, [latest, artworkReady, animationEnabled]);

    useEffect(() => () => {
        if (pendingRef.current) window.clearTimeout(pendingRef.current.timer);
        pendingRef.current = null;
        if (clearPreviousRef.current !== null) window.clearTimeout(clearPreviousRef.current);
        clearPreviousRef.current = null;
    }, []);

    return state;
}

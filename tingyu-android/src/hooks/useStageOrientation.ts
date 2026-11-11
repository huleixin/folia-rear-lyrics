import { useCallback, useEffect, useRef, useState } from 'react';
import { createStageOrientationSession, orientationError } from '../services/nativeStageOrientation';
import type { StageOrientationSession, StageOrientationSnapshot } from '../services/nativeStageOrientation';

// src/hooks/useStageOrientation.ts
// active means the main display's full stage is visible; pass false as soon as it is left.
export type StageOrientationResult = StageOrientationSnapshot & { toggle(): Promise<void> };
const IDLE: StageOrientationSnapshot = { landscape: false, pending: false };

export function useStageOrientation(active: boolean): StageOrientationResult {
    const [state, setState] = useState<StageOrientationSnapshot>(IDLE);
    const [busy, setBusy] = useState(false);
    const sessionRef = useRef<StageOrientationSession | null>(null);
    const activeRef = useRef(active); activeRef.current = active;
    const inFlight = useRef(false);
    useEffect(() => {
        if (!active) { setState(IDLE); setBusy(false); return; }
        let disposed = false;
        setState(IDLE);
        const session = createStageOrientationSession(next => { if (!disposed) setState(next); });
        sessionRef.current = session;
        void session.ready.catch(error => {
            if (!disposed) setState({ ...IDLE, error: orientationError(error) });
        });
        return () => {
            disposed = true;
            if (sessionRef.current === session) sessionRef.current = null;
            inFlight.current = false;
            void session.close().catch(() => undefined);
        };
    }, [active]);
    const toggle = useCallback(async () => {
        const session = sessionRef.current;
        if (!activeRef.current || !session || inFlight.current) return;
        inFlight.current = true; setBusy(true);
        setState(previous => ({ ...previous, error: undefined }));
        try { await session.toggle(); }
        catch (error) {
            if (sessionRef.current === session) setState(previous => ({ ...previous, error: orientationError(error) }));
        } finally {
            if (sessionRef.current === session) { inFlight.current = false; setBusy(false); }
        }
    }, []);
    return { landscape: active && state.landscape, pending: active && (state.pending || busy), error: active ? state.error : undefined, toggle };
}

import { useCallback, useEffect, useRef } from 'react';
import { mobileCollectionLoader, scheduleMobileCollectionPreload } from './mobileCollectionPreload';

// src/library/suites/mobile/useMobileCollectionPreload.ts
export function useMobileCollectionPreload(enabled: boolean) {
    const cancel = useRef<(() => void) | undefined>(undefined);
    useEffect(() => {
        if (!enabled) return;
        const cleanup = scheduleMobileCollectionPreload(mobileCollectionLoader.preload);
        cancel.current = cleanup;
        return () => { cleanup(); if (cancel.current === cleanup) cancel.current = undefined; };
    }, [enabled]);
    return useCallback(() => {
        if (!enabled) return;
        cancel.current?.();
        cancel.current = undefined;
        void mobileCollectionLoader.preload().catch(() => { /* Navigation can retry. */ });
    }, [enabled]);
}

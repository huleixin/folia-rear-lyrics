import { useEffect, useLayoutEffect, useRef } from 'react';
import { registerModalBack } from '../services/modalBackStack';

// src/hooks/useModalBackHandler.ts
/** Refresh actions without changing the modal's position in the back stack on every render. */
export function useModalBackHandler(active: boolean, onBack: () => void) {
    const latest = useRef(onBack);
    useLayoutEffect(() => { latest.current = onBack; });
    useEffect(() => active ? registerModalBack(() => latest.current()) : undefined, [active]);
}

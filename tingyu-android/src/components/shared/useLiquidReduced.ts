import { useReducedMotion } from 'framer-motion';
import { resolveReducedMotion, useMotionSettingsStore } from '../../stores/useMotionSettingsStore';

// src/components/shared/useLiquidReduced.ts
export function useLiquidReduced(): boolean {
    const system = useReducedMotion();
    const followSystem = useMotionSettingsStore(state => state.followSystemReducedMotion);
    const configured = useMotionSettingsStore(state => resolveReducedMotion(state, 'uiMicroMotion'));
    return configured || (followSystem && system === true);
}

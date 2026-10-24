import { create } from 'zustand';

// src/stores/useRearRuntimeStore.ts
// Volatile native capability snapshot; never persist it as the user's rear-lyrics preference.
export const useRearRuntimeStore = create<{ enabled: boolean; sleeping: boolean }>(() => ({ enabled: false, sleeping: false }));
export function setRearRuntime(enabled: boolean, sleeping: boolean) {
    const previous = useRearRuntimeStore.getState();
    if (previous.enabled !== enabled || previous.sleeping !== sleeping) useRearRuntimeStore.setState({ enabled, sleeping });
}

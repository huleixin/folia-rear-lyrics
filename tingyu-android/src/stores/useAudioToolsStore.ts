import { create } from 'zustand';
import type { AudioQualityPreference } from '../types/onlineMusic';

// src/stores/useAudioToolsStore.ts
export const QUALITY_LABELS: Record<AudioQualityPreference, string> = { standard: '标准', high: '高品质', lossless: '无损', hires: 'Hi-Res' };
export const useAudioToolsStore = create<{
    open: boolean; switching: boolean; error: string; actual: { key: string; quality: AudioQualityPreference } | null;
    request: { quality: AudioQualityPreference; id: number } | null;
    show: () => void; close: () => void; switchQuality: (quality: AudioQualityPreference) => void;
}>(set => ({
    open: false, switching: false, error: '', actual: null, request: null,
    show: () => set({ open: true, error: '' }), close: () => set({ open: false }),
    switchQuality: quality => set({ request: { quality, id: Date.now() }, error: '' }),
}));

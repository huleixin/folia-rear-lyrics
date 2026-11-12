// Upstream optional envelope contract only; Android uses its live vocal frequency band.
export const VOCAL_FPS = 50;
export interface VocalEnvelope { fps: number; db: Float32Array; top: number; onsets: Uint32Array; from?: number }

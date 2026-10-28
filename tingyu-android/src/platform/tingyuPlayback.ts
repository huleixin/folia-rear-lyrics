import { registerPlugin } from '@capacitor/core';

// src/platform/tingyuPlayback.ts
// Share one proxy between the media adapter and the test-only diagnostics contract.
const native = registerPlugin('TingyuPlayback');
export const getTingyuPlayback = <T>(): T => native as T;

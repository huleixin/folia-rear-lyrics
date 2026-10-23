import { registerPlugin } from '@capacitor/core';

// src/platform/foliaNative.ts
// One proxy shared by feature-specific contracts; registering per hook emits duplicate warnings.
const native = registerPlugin('FoliaNative');
export const getFoliaNative = <T>(): T => native as T;

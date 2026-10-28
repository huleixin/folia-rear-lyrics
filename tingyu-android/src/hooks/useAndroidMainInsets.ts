import { useLayoutEffect } from 'react';
import { installAndroidMainInsets } from '../services/androidMainInsets';

// src/hooks/useAndroidMainInsets.ts
// Share the early process-owned subscription; do not introduce a later inset reset.
export function useAndroidMainInsets(){useLayoutEffect(installAndroidMainInsets,[])}

import { useSyncExternalStore } from 'react';
import { isMainStageActive, isRearStageActive, subscribeMainStageActivity, subscribeRearStageActivity } from '../utils/stageActivity';

// src/hooks/useStageActivity.ts
// React receives only activity transitions, never frame times.
export const useMainStageActive = () => useSyncExternalStore(subscribeMainStageActivity, isMainStageActive, () => true);
export const useRearStageActive = () => useSyncExternalStore(subscribeRearStageActivity, isRearStageActive, () => true);

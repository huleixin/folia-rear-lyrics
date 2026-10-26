import { isAndroidNativeRuntime } from './platform';

// src/utils/stageActivity.ts
// Render demand only: hiding a stage never suspends the playback WebView or its rear publisher.
export const MAIN_STAGE_ACTIVITY_EVENT = 'tingyu-main-stage-activity';
type StageWindow = Window & { __tingyuMainVisible?: boolean; __tingyuRearSleeping?: boolean };
export const isMainStageActive = () => !isAndroidNativeRuntime() ||
    (!document.hidden && (window as StageWindow).__tingyuMainVisible !== false);
export const isRearStageActive = () => !document.hidden && (window as StageWindow).__tingyuRearSleeping !== true;
export function subscribeMainStageActivity(changed: () => void) {
    document.addEventListener('visibilitychange', changed);
    window.addEventListener(MAIN_STAGE_ACTIVITY_EVENT, changed);
    return () => { document.removeEventListener('visibilitychange', changed); window.removeEventListener(MAIN_STAGE_ACTIVITY_EVENT, changed); };
}
export function subscribeRearStageActivity(changed: () => void) {
    const power = (event: Event) => {
        (window as StageWindow).__tingyuRearSleeping = (event as CustomEvent<{sleeping:boolean}>).detail?.sleeping === true;
        changed();
    };
    document.addEventListener('visibilitychange', changed); window.addEventListener('folia-rear-power', power);
    return () => { document.removeEventListener('visibilitychange', changed); window.removeEventListener('folia-rear-power', power); };
}

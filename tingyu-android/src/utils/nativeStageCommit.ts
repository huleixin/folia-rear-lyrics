// src/utils/nativeStageCommit.ts
// React's shell may commit while its lazy player is still absent. Keep native home until both exist.
export const canPublishNativeStage = (route: string, root: Element | null): boolean => {
    if (route !== 'stage') return true;
    if (root?.getAttribute('data-folia-player-view') !== 'true') return false;
    return root.getAttribute('data-folia-player-presentation') !== 'minimal'
        || !!root.querySelector('[data-player-surface-ready="true"]');
};

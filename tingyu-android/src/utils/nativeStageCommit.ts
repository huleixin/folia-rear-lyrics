// src/utils/nativeStageCommit.ts
// React's shell may commit while its lazy player is still absent. Keep native home until both exist.
//
// 第 12 轮：极简播放页被 Compose 接管后，WebView 上的 `[data-player-surface-ready]` 随
// MinimalStage 卸载一起消失 —— 但播放面并没有消失，只是换了画笔。路由发布因此多带一个
// composeOwnsMinimal 事实：为 true 时不再等那个 WebView 专属属性，否则从设置页返回 stage
// 的路由更新会被这道门永远拦下（真机表现就是"进入设置后返回卡住"）。
export const canPublishNativeStage = (
    route: string,
    root: Element | null,
    composeOwnsMinimal = false,
): boolean => {
    if (route !== 'stage') return true;
    if (root?.getAttribute('data-folia-player-view') !== 'true') return false;
    return root.getAttribute('data-folia-player-presentation') !== 'minimal'
        || !!root.querySelector('[data-player-surface-ready="true"]')
        || composeOwnsMinimal;
};

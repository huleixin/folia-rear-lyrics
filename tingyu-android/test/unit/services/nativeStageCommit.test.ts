// @vitest-environment jsdom
import { expect,it } from 'vitest';
import {canPublishNativeStage} from '@/utils/nativeStageCommit';

// test/unit/services/nativeStageCommit.test.ts
it('does not reveal a stage while the DOM still belongs to home or startup',()=>{
    const root=document.createElement('div');
    expect(canPublishNativeStage('stage',null)).toBe(false);
    expect(canPublishNativeStage('stage',root)).toBe(false);
    root.setAttribute('data-folia-player-view','true');
    expect(canPublishNativeStage('stage',root)).toBe(true);
    root.removeAttribute('data-folia-player-view');
    expect(canPublishNativeStage('stage',root)).toBe(false);
    for(const route of ['home','collection','search','settings'])expect(canPublishNativeStage(route,root)).toBe(true);
});

it('waits for the actual lazy minimal player, not only the app-shell route flag', () => {
    const root = document.createElement('div');
    root.setAttribute('data-folia-player-view', 'true');
    root.setAttribute('data-folia-player-presentation', 'minimal');
    expect(canPublishNativeStage('stage', root)).toBe(false);
    const surface = document.createElement('div');
    surface.setAttribute('data-player-surface-ready', 'true');
    root.append(surface);
    expect(canPublishNativeStage('stage', root)).toBe(true);
    surface.remove();
    expect(canPublishNativeStage('stage', root)).toBe(false);
    expect(canPublishNativeStage('home', root)).toBe(true);
});

// 第 12 轮：Compose 接管极简页后，WebView 的 surface-ready 属性随 MinimalStage 卸载消失。
// 只要 Compose 还持有显示权，发往 stage 的路由更新就不能被这道门拦下 ——
// 否则从设置页返回时外壳永远停在设置页（真机"返回卡死"根因）。
it('lets the stage publish while Compose owns the minimal surface, even without the WebView flag', () => {
    const root = document.createElement('div');
    root.setAttribute('data-folia-player-view', 'true');
    root.setAttribute('data-folia-player-presentation', 'minimal');
    expect(canPublishNativeStage('stage', root, false)).toBe(false);
    expect(canPublishNativeStage('stage', root, true)).toBe(true);
    // 与 WebView 属性同时存在时依然放行；其余路由不受影响。
    const surface = document.createElement('div');
    surface.setAttribute('data-player-surface-ready', 'true');
    root.append(surface);
    expect(canPublishNativeStage('stage', root, false)).toBe(true);
    expect(canPublishNativeStage('settings', root, false)).toBe(true);
});

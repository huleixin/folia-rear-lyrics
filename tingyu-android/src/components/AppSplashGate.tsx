import { navigationMark } from '../services/navigationTiming';
import React from 'react';
import { hideAppSplash } from '../utils/appSplash';
import { diagnosticEvent, reportStartupStage } from '../services/diagnostics/diagnosticLog';
import { preloadStartupInteractiveSurfaces } from '../services/startupPreload';

// src/components/AppSplashGate.tsx
// 包在根组件树外层：首帧挂载完成后（useEffect 在浏览器绘制之后触发）移除首屏加载遮罩，
// 保证遮罩淡出时下面已经是渲染好的界面，而不是空白。

const AppSplashGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    React.useEffect(() => {
        let cancelled = false;
        navigationMark('react-first-commit');
        // 冷启动的关键阶段：JS 首帧提交。常开、只记一条，不依赖 navigation 诊断开关。
        // 与原生 activity-create（events.jsonl 里 t 更早的那条）相减即为「窗口起到可交互」。
        diagnosticEvent('perf', 'info', 'startup-react-commit', {
            ms: typeof performance === 'undefined' ? 0 : Math.round(performance.now()),
        });
        const finish = () => {
            if (cancelled) return;
            hideAppSplash();
            // 两帧之后再报「启动完成」：第一帧是 React 提交，第二帧才是用户真正能看到的画面。
            // 这是启动守卫唯一的成功信号 —— 没有它，连续两次冷启动都会被算作失败。
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => requestAnimationFrame(() => reportStartupStage('startup-complete')));
            } else {
                reportStartupStage('startup-complete');
            }
        };
        const runtime = window as Window & {
            __tingyuLaunch?: { show?: boolean; native?: boolean };
            TingyuLaunch?: { ready?: () => void };
        };
        const nativeSplashActive = Boolean(runtime.__tingyuLaunch?.show && runtime.__tingyuLaunch?.native && runtime.TingyuLaunch);
        if (nativeSplashActive) {
            const minimumWarmup = new Promise<void>(resolve => window.setTimeout(resolve, 160));
            void Promise.all([preloadStartupInteractiveSurfaces(380), minimumWarmup]).finally(finish);
        } else {
            void preloadStartupInteractiveSurfaces(0);
            finish();
        }
        return () => {
            cancelled = true;
        };
    }, []);

    return <>{children}</>;
};

export default AppSplashGate;

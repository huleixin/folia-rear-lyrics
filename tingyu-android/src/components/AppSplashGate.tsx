import { navigationMark } from '../services/navigationTiming';
import React from 'react';
import { hideAppSplash } from '../utils/appSplash';
import { diagnosticEvent } from '../services/diagnostics/diagnosticLog';

// src/components/AppSplashGate.tsx
// 包在根组件树外层：首帧挂载完成后（useEffect 在浏览器绘制之后触发）移除首屏加载遮罩，
// 保证遮罩淡出时下面已经是渲染好的界面，而不是空白。

const AppSplashGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    React.useEffect(() => {
        navigationMark('react-first-commit');
        // 冷启动的关键阶段：JS 首帧提交。常开、只记一条，不依赖 navigation 诊断开关。
        // 与原生 activity-create（events.jsonl 里 t 更早的那条）相减即为「窗口起到可交互」。
        diagnosticEvent('perf', 'info', 'startup-react-commit', {
            ms: typeof performance === 'undefined' ? 0 : Math.round(performance.now()),
        });
        hideAppSplash();
    }, []);

    return <>{children}</>;
};

export default AppSplashGate;

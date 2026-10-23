import { useEffect, useState } from 'react';

// src/components/app/search/useVisualViewport.ts
// 搜索页铺满「可视视口」而不是布局视口：Android WebView 打开输入法后，布局视口可能仍是整屏，
// 只有 visualViewport 会缩小。固定高度若不跟随它，列表底部就会落到键盘下面，
// 看起来像一条截断的建议加一块黑色空档。

export interface VisualViewportBox {
    /** 可视高度；0 表示环境没有 visualViewport，调用方应退回 inset:0。 */
    height: number;
    /** 可视区域相对布局视口的纵向偏移（输入法把页面顶起时会变化）。 */
    offsetTop: number;
    /** 键盘占位：可视高度明显小于布局高度时为 true。 */
    keyboardOpen: boolean;
}

const EMPTY: VisualViewportBox = { height: 0, offsetTop: 0, keyboardOpen: false };

export function useVisualViewport(): VisualViewportBox {
    const [box, setBox] = useState<VisualViewportBox>(EMPTY);

    useEffect(() => {
        const viewport = typeof window !== 'undefined' ? window.visualViewport : null;
        if (!viewport) return;
        let frame = 0;
        const measure = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
                setBox({
                    height: Math.round(viewport.height),
                    offsetTop: Math.round(viewport.offsetTop),
                    keyboardOpen: layoutHeight - viewport.height > Math.max(120, layoutHeight * 0.15),
                });
            });
        };
        measure();
        viewport.addEventListener('resize', measure);
        viewport.addEventListener('scroll', measure);
        window.addEventListener('resize', measure);
        return () => {
            cancelAnimationFrame(frame);
            viewport.removeEventListener('resize', measure);
            viewport.removeEventListener('scroll', measure);
            window.removeEventListener('resize', measure);
        };
    }, []);

    return box;
}

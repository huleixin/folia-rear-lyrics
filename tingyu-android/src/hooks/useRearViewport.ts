import { useEffect, useState } from 'react';
import { resolveRearViewport, type RearNativeViewport } from '../utils/rearViewport';

// src/hooks/useRearViewport.ts
// Only the top document knows the visual viewport; an iframe's visual viewport equals its layout size.
function measure(native?: RearNativeViewport | null) {
    return resolveRearViewport({ width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
        window.visualViewport, native);
}
export function useRearViewport() {
    const [viewport, setViewport] = useState(() => measure());
    useEffect(() => {
        let native: RearNativeViewport | null = null, stopped = false, timer = 0, lastReport = '';
        const controller = new AbortController();
        const update = () => {
            const next = measure(native);
            setViewport(previous => previous.left === next.left && previous.top === next.top
                && previous.width === next.width && previous.height === next.height ? previous : next);
        };
        const poll = async () => {
            try {
                const response = await fetch('/__folia_rear/viewport', { cache: 'no-store', signal: controller.signal });
                if (response.ok) native = await response.json();
                if (stopped) return;
                update();
                const current = measure(native);
                const report = new URLSearchParams(Object.entries({ layoutWidth: document.documentElement.clientWidth,
                    layoutHeight: document.documentElement.clientHeight, visualWidth: window.visualViewport?.width ?? innerWidth,
                    visualHeight: window.visualViewport?.height ?? innerHeight, dpr: devicePixelRatio, ...current })
                    .map(([key, value]) => [key, String(Math.round(value * 100) / 100)])).toString();
                if (report !== lastReport) {
                    lastReport = report;
                    await fetch(`/__folia_rear/viewport-report?${report}`, { cache: 'no-store', signal: controller.signal });
                }
            } catch { /* Browser preview has no native endpoint; use its actual visual viewport. */ }
            finally { if (!stopped) timer = window.setTimeout(poll, 1000); }
        };
        window.addEventListener('resize', update);
        window.visualViewport?.addEventListener('resize', update);
        window.visualViewport?.addEventListener('scroll', update);
        void poll();
        return () => {
            stopped = true; controller.abort(); clearTimeout(timer);
            window.removeEventListener('resize', update);
            window.visualViewport?.removeEventListener('resize', update);
            window.visualViewport?.removeEventListener('scroll', update);
        };
    }, []);
    return viewport;
}

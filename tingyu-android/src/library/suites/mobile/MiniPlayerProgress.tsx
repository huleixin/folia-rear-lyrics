import React, { useEffect, useRef } from 'react';
import { currentTime } from '../../../stores/motionSignals';
import { usePlaybackStore, selectDisplayDuration } from '../../../stores/usePlaybackStore';
import { isMainStageActive, subscribeMainStageActivity } from '../../../utils/stageActivity';

// src/library/suites/mobile/MiniPlayerProgress.tsx
export default function MiniPlayerProgress() {
    const duration = usePlaybackStore(selectDisplayDuration);
    const ref = useRef<SVGCircleElement>(null);
    useEffect(() => {
        let lastStep = -1;
        const update = () => {
            const node = ref.current;
            if (!node || !isMainStageActive() || node.closest('[inert]')) return;
            const position = currentTime.get();
            const progress = Number.isFinite(position) && duration > 0 && Number.isFinite(duration)
                ? Math.max(0, Math.min(1, position / duration)) : 0;
            // 0.25-second steps; no React clock, RAF or perpetual timer on the library page.
            const step = Math.floor(position * 4);
            if (step === lastStep) return;
            lastStep = step;
            node.style.strokeDashoffset = String(100 * (1 - progress));
        };
        update(); const unsubscribe = currentTime.on('change', update);
        const activity = subscribeMainStageActivity(() => { lastStep = -1; update(); });
        const visibility = new MutationObserver(() => { lastStep = -1; update(); });
        const footer = ref.current?.closest('footer');
        if (footer) visibility.observe(footer, { attributes: true, attributeFilter: ['inert'] });
        return () => { unsubscribe(); activity(); visibility.disconnect(); };
    }, [duration]);
    return <svg className="ml-mini-progress" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="16" className="ml-mini-progress-track" />
        <circle ref={ref} cx="20" cy="20" r="16" pathLength="100" strokeDasharray="100" strokeDashoffset="100"
            className="ml-mini-progress-value" transform="rotate(-90 20 20)" />
    </svg>;
}

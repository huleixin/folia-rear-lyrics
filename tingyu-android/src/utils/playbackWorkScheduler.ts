import { requestVisualizerAnimationFrame, cancelVisualizerAnimationFrame } from './visualizerFrameChannel';

// src/utils/playbackWorkScheduler.ts
// Keep precise visible motion on RAF; hidden clocks read the real media element on a sparse timer.
export function playbackWorkPolicy(android: boolean, visible: boolean, playerVisible: boolean, rearAwake: boolean) {
    const animate = !android || (visible && playerVisible);
    return { animate, sampleAudio: animate || rearAwake, delay: rearAwake ? 100 : visible ? 250 : 1000 };
}

export function startPlaybackWorkScheduler(update: (sampleAudio: boolean) => void,
    policy: () => ReturnType<typeof playbackWorkPolicy>, frameRef: { current: number }) {
    let stopped = false, timer = 0;
    const cancel = () => { cancelVisualizerAnimationFrame(frameRef.current); frameRef.current = 0; clearTimeout(timer); timer = 0; };
    const tick = () => {
        if (stopped) return;
        frameRef.current = 0; timer = 0;
        const current = policy();
        update(current.sampleAudio);
        if (stopped) return;
        if (current.animate) frameRef.current = requestVisualizerAnimationFrame(tick);
        else timer = window.setTimeout(tick, current.delay);
    };
    const refresh = () => { cancel(); tick(); };
    document.addEventListener('visibilitychange', refresh);
    tick();
    return () => { stopped = true; cancel(); document.removeEventListener('visibilitychange', refresh); };
}

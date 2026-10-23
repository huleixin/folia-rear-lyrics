import { stepFumeCamera, type FumeCameraState, type FumeCameraStepInput } from './fumeCameraStep';

// src/components/visualizer/fume/settleFumeSurfaceEntry.ts
// A rear window opened mid-song (including paused playback) starts at the current reading focus.
// Only this initial catch-up is settled; later retarget/zoom/flight animations use the original driver.
export function settleFumeSurfaceEntry(state: FumeCameraState, input: FumeCameraStepInput) {
    stepFumeCamera(state, input);
    state.retarget.startedAt = input.time - Math.max(.1, state.retarget.duration);
    state.retarget.bridgeMode = 'none';
    const settledInput = { ...input, dt: 1 / 30 };
    for (let index = 0; index < 48; index++) stepFumeCamera(state, settledInput);
}

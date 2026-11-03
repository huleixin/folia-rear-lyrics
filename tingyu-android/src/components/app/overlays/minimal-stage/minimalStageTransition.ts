// src/components/app/overlays/minimal-stage/minimalStageTransition.ts
// The player page leaves the screen the same way it arrived — through an animation — but the things
// that ask to leave it (the collapse chevron, the system Back gesture) live outside this component
// and expect to finish synchronously.
//
// This module is that hand-off: the minimal stage registers a runner while it is mounted, and the
// navigation hook calls `runMinimalStageExit(done)` instead of `done()` directly. When nothing is
// registered — the classic stage, a non-mobile suite, the browser preview with no player — the
// callback simply runs at once, so behaviour outside the minimal page is unchanged.

type ExitRunner = (done: () => void) => void;

let runner: ExitRunner | null = null;

export const registerMinimalStageExit = (next: ExitRunner): (() => void) => {
    runner = next;
    return () => {
        if (runner === next) {
            runner = null;
        }
    };
};

export const runMinimalStageExit = (done: () => void): void => {
    const current = runner;
    if (current) {
        current(done);
        return;
    }
    done();
};

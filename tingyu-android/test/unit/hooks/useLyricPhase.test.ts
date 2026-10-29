// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import { expect, it } from 'vitest';
import { useLyricPhase } from '@/components/visualizer/useLyricPhase';

// test/unit/hooks/useLyricPhase.test.ts
it('mounts at the real lyric phase without per-frame renders and permits backward seeks', async () => {
    const time = motionValue(4), phases: string[] = [], host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const state = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = state.IS_REACT_ACT_ENVIRONMENT; state.IS_REACT_ACT_ENVIRONMENT = true;
    function Sample() { const phase = useLyricPhase(time, 1, 2); phases.push(phase); return React.createElement('span', null, phase); }
    try {
        await act(async () => root.render(React.createElement(Sample)));
        expect(host.textContent).toBe('passed'); expect(phases).toEqual(['passed']);
        await act(async () => { for (let t = 4; t < 5; t += .01) time.set(t); });
        expect(phases).toEqual(['passed']);
        await act(async () => time.set(1.5)); expect(host.textContent).toBe('active');
        await act(async () => time.set(.2)); expect(host.textContent).toBe('waiting');
    } finally {
        await act(async () => root.unmount()); host.remove(); time.destroy(); state.IS_REACT_ACT_ENVIRONMENT = previous;
    }
});

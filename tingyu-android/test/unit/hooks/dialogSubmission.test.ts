// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useDialogSubmission } from '@/components/shared/useDialogSubmission';

// test/unit/hooks/dialogSubmission.test.ts
it('coalesces rapid submission and ignores results from a previous opening', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(document.createElement('div'));
    let api!: ReturnType<typeof useDialogSubmission>;
    function Probe({ open }: { open: boolean }) { api = useDialogSubmission(open); return null; }
    let finish!: () => void;
    const action = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const success = vi.fn(), failure = vi.fn();
    try {
        await act(() => root.render(React.createElement(Probe, { open: true })));
        let first!: Promise<void>;
        await act(() => { first = api.submit(action, success, failure); void api.submit(action, success, failure); });
        expect(action).toHaveBeenCalledTimes(1);
        await act(() => root.render(React.createElement(Probe, { open: false })));
        await act(() => root.render(React.createElement(Probe, { open: true })));
        await act(async () => { finish(); await first; });
        expect(success).not.toHaveBeenCalled();
        await act(() => api.submit(() => Promise.reject(new Error('offline')), success, failure));
        expect(failure).toHaveBeenCalledTimes(1);
        expect(success).not.toHaveBeenCalled();
        expect(api.busy).toBe(false);
    } finally { await act(() => root.unmount()); }
});

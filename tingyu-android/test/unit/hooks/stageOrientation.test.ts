// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStageOrientation, type StageOrientationResult } from '@/hooks/useStageOrientation';
import type { StageOrientationSession, StageOrientationSnapshot } from '@/services/nativeStageOrientation';

// test/unit/hooks/stageOrientation.test.ts
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/services/nativeStageOrientation', () => ({
    createStageOrientationSession: mocks.create, orientationError: (error: Error) => error.message,
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement, value: StageOrientationResult;
let changed: (state: StageOrientationSnapshot) => void, session: StageOrientationSession;
function Probe({ active }: { active: boolean }) { value = useStageOrientation(active); return h('div'); }
beforeEach(() => {
    vi.clearAllMocks();
    session = { ready: Promise.resolve(), toggle: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    mocks.create.mockImplementation(callback => { changed = callback; return session; });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const mount = (active = true) => act(async () => { root.render(h(Probe, { active })); });

it('opens only for an active stage and restores on leaving or unmount', async () => {
    await mount(false); expect(mocks.create).not.toHaveBeenCalled();
    await mount(); act(() => changed({ landscape: true, pending: false })); expect(value.landscape).toBe(true);
    await mount(false); expect(session.close).toHaveBeenCalledOnce(); expect(value.landscape).toBe(false);
    expect(value.pending).toBe(false);
});
it('takes Back state from native rather than optimistically flipping landscape on click', async () => {
    await mount(); await act(async () => value.toggle()); expect(value.landscape).toBe(false);
    act(() => changed({ landscape: true, pending: true })); expect(value.landscape).toBe(true); expect(value.pending).toBe(true);
    act(() => changed({ landscape: false, pending: false })); expect(value.landscape).toBe(false); expect(value.pending).toBe(false);
});
it('exposes browser/native errors for the stage UI without an unhandled promise', async () => {
    session.toggle = vi.fn(async () => { throw new Error('Screen orientation is unsupported'); });
    await mount(); await act(async () => value.toggle());
    expect(value.error).toBe('Screen orientation is unsupported'); expect(value.pending).toBe(false);
});
it('blocks rapid clicks and clears pending once the request completes', async () => {
    let resolve!: () => void; session.toggle = vi.fn(() => new Promise<void>(r => { resolve = r; }));
    await mount(); let first!: Promise<void>; act(() => { first = value.toggle(); });
    expect(value.pending).toBe(true); await act(async () => value.toggle()); expect(session.toggle).toHaveBeenCalledOnce();
    await act(async () => { resolve(); await first; }); expect(value.pending).toBe(false);
});
it('ignores delayed errors/events from an old mount after a new stage opens', async () => {
    let reject!: (error: Error) => void; session.toggle = vi.fn(() => new Promise<void>((_resolve, r) => { reject = r; }));
    await mount(); const oldChanged = changed; let first!: Promise<void>; act(() => { first = value.toggle(); });
    await mount(false);
    session = { ready: Promise.resolve(), toggle: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    await mount(); act(() => changed({ landscape: true, pending: false }));
    await act(async () => { oldChanged({ landscape: false, pending: true }); reject(new Error('old failure')); await first; });
    expect(value.landscape).toBe(true); expect(value.pending).toBe(false); expect(value.error).toBeUndefined();
});

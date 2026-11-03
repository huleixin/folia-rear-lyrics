// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
    useMinimalCoverTransition,
    type MinimalCoverSnapshot,
} from '@/components/app/overlays/minimal-stage/useMinimalCoverTransition';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Snapshot extends MinimalCoverSnapshot { title: string }
let root: Root;
let state: { current: Snapshot; previous: Snapshot | null };
const snapshot = (key: string, coverSource: string | null = `decoded:${key}`, title = key): Snapshot => ({
    key,
    artKey: `art:${key}`,
    coverSource,
    title,
});
const Harness = ({ value, ready, enabled = true }: { value: Snapshot; ready: boolean; enabled?: boolean }) => {
    state = useMinimalCoverTransition(value, ready, enabled);
    return React.createElement('div', {
        'data-current': state.current.key,
        'data-previous': state.previous?.key ?? '',
    });
};
const render = (value: Snapshot, ready = true, enabled = true) => act(() => {
    root.render(React.createElement(Harness, { value, ready, enabled }));
});
const flush = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
    vi.useFakeTimers();
    root = createRoot(document.createElement('div'));
});
afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
});

it('waits briefly for the decoded cover, then crossfades a matched cover and caption', async () => {
    render(snapshot('A'));
    render(snapshot('B', null), false);
    expect(state.current.key).toBe('A');

    // Unrelated metadata updates for B must not restart its bounded image wait.
    render(snapshot('B', null, 'B updated'), false);
    await flush(679);
    expect(state.current.key).toBe('A');
    await flush(1);
    expect(state.current.key).toBe('B');
    expect(state.current.title).toBe('B updated');
    expect(state.previous?.key).toBe('A');

    await flush(420);
    expect(state.previous).toBeNull();
});

it('lets the latest rapid skip replace pending and outgoing snapshots', async () => {
    render(snapshot('A'));
    render(snapshot('B', null), false);
    render(snapshot('C'), true);
    expect(state.current.key).toBe('C');
    expect(state.previous?.key).toBe('A');

    render(snapshot('D'), true);
    expect(state.current.key).toBe('D');
    expect(state.previous?.key).toBe('C');
    await flush(700);
    expect(state.current.key).toBe('D');
    expect(state.previous).toBeNull();
});

it('reveals a late cover for the current song without replaying the song transition', async () => {
    render(snapshot('A'));
    render(snapshot('B', null), false);
    await flush(680);
    expect(state.current.key).toBe('B');
    expect(state.previous?.key).toBe('A');

    render(snapshot('B', 'decoded:B'), true);
    expect(state.current.coverSource).toBe('decoded:B');
    expect(state.previous?.key).toBe('A');
});

it('commits immediately without retaining an outgoing layer when motion is disabled', () => {
    render(snapshot('A'));
    render(snapshot('B'), true, false);
    expect(state.current.key).toBe('B');
    expect(state.previous).toBeNull();
});

it('re-arms pending transitions correctly under React StrictMode', async () => {
    act(() => root.render(React.createElement(React.StrictMode, null,
        React.createElement(Harness, { value: snapshot('A'), ready: true }),
    )));
    act(() => root.render(React.createElement(React.StrictMode, null,
        React.createElement(Harness, { value: snapshot('B', null), ready: false }),
    )));
    await flush(680);
    expect(state.current.key).toBe('B');
    expect(state.previous?.key).toBe('A');
});

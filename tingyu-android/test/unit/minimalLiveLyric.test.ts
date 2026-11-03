// @vitest-environment jsdom
import React, { act } from 'react';
import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { LyricData, Line } from '@/types';
import { lyricCurrentTime } from '@/stores/motionSignals';

vi.mock('framer-motion', async importOriginal => {
    const actual = await importOriginal<typeof import('framer-motion')>();
    const ReactModule = await import('react');
    type MotionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
        initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown;
    };
    const button = ReactModule.forwardRef<HTMLButtonElement, MotionButtonProps>(
        ({ initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }, ref) =>
            ReactModule.createElement('button', { ...props, ref }),
    );
    return {
        ...actual,
        AnimatePresence: ({ children }: PropsWithChildren) => ReactModule.createElement(ReactModule.Fragment, null, children),
        motion: { button },
    };
});

import MinimalLiveLyric from '@/components/app/overlays/minimal-stage/MinimalLiveLyric';

// test/unit/minimalLiveLyric.test.ts
const line = (fullText: string, startTime: number, endTime: number): Line => ({
    fullText, startTime, endTime, words: [],
});
let root: Root | null = null;
let host: HTMLDivElement | null = null;

const mount = (lyrics: LyricData | null, songKey = 'song-a', onOpen = vi.fn()) => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root?.render(React.createElement(MinimalLiveLyric, { lyrics, songKey, active: true, onOpen })));
    return { onOpen, host };
};

afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    host?.remove();
    host = null;
    lyricCurrentTime.set(0);
});

it('follows the shared lyric clock, swaps only at line boundaries, and opens the lyric page on tap', () => {
    const lyrics: LyricData = { lines: [line('第一句', 0, 4), line('第二句', 4, 8)] };
    const view = mount(lyrics);

    expect(view.host.querySelector('button')?.textContent).toBe('第一句');
    act(() => lyricCurrentTime.set(2));
    expect(view.host.querySelector('button')?.textContent).toBe('第一句');
    act(() => lyricCurrentTime.set(4));
    expect(view.host.querySelector('button')?.textContent).toBe('第二句');
    act(() => view.host.querySelector('button')?.click());
    expect(view.onOpen).toHaveBeenCalledOnce();
});

it('does not retain a previous song lyric or show placeholder text when lyrics are absent', () => {
    const lyrics: LyricData = { lines: [line('旧歌曲歌词', 0, 10)] };
    const view = mount(lyrics);
    expect(view.host.textContent).toContain('旧歌曲歌词');
    act(() => root?.render(React.createElement(MinimalLiveLyric, { lyrics: null, songKey: 'song-b', active: true, onOpen: view.onOpen })));
    expect(view.host.querySelector('[data-testid="minimal-live-lyric"]')).toBeNull();
    expect(view.host.textContent).toBe('');
});

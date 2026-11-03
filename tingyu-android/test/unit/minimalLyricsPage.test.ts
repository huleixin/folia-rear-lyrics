// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import MinimalLyricsPage from '@/components/app/overlays/minimal-stage/MinimalLyricsPage';
import { lyricCurrentTime } from '@/stores/motionSignals';
import type { LyricData } from '@/types';

// test/unit/minimalLyricsPage.test.ts
vi.mock('@/components/app/overlays/minimal-stage/MinimalArtwork', () => ({ default: () => null }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement;
const lyrics: LyricData = { lines: [
    {fullText:'甲乙丙',startTime:0,endTime:3,words:[
        {text:'甲',startTime:0,endTime:1},{text:'乙',startTime:1,endTime:2},{text:'丙',startTime:2,endTime:3},
    ]},
    {fullText:'新歌曲',startTime:4,endTime:7,words:[]},
] };
const render = (data=lyrics) => act(() => root!.render(React.createElement(MinimalLyricsPage, {
    song:{ title:'测试歌曲', artist:'歌手', coverUrl:null }, lyrics:data, coverUrl:null,
    controls:{onSeek:vi.fn()} as never, active:true, still:true,
})));
afterEach(() => { act(() => root?.unmount()); root=null; host?.remove(); lyricCurrentTime.set(0); });
it('advances real timed grapheme marks, reverses them on seek, and clears them on replacement', () => {
    host=document.createElement('div'); document.body.append(host); root=createRoot(host);
    lyricCurrentTime.set(.5); render();
    const text=host.querySelector('.min-line__text')!;
    act(() => lyricCurrentTime.set(1.5));
    expect(text.querySelectorAll('[data-sung]')).toHaveLength(1);
    act(() => lyricCurrentTime.set(2.5));
    expect(text.querySelectorAll('[data-sung]')).toHaveLength(2);
    act(() => lyricCurrentTime.set(.5));
    expect(text.querySelectorAll('[data-sung]')).toHaveLength(0);
    render({lines:[{fullText:'替换歌词',startTime:0,endTime:8,words:[]}]});
    expect(host.textContent).not.toContain('甲乙丙');
    expect(host.querySelector('[data-active]')?.textContent).toContain('替换歌词');
});
